import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import type { Candle } from '../../models/markets';
import { closePrice, exitOnCandle, filledInsideCandle, NO_COSTS, openPrice, orderFillPrice, type FillCosts } from '../fills';

const candle = (open: string, high: string, low: string, close: string): Candle => ({
  time: '2020-01-01T00:00:00.000Z' as UtcIso,
  open: dec(open),
  high: dec(high),
  low: dec(low),
  close: dec(close),
  volume: null,
});

const COSTS: FillCosts = { halfSpread: dec('0.5'), slippage: dec('0.1'), limitRule: 'through' };

describe('shared fill conventions', () => {
  it('buys at the ask and sells at the bid, with slippage on market fills', () => {
    expect(openPrice(COSTS, 'buy', dec(100), true).toString()).toBe('100.6');
    expect(openPrice(COSTS, 'sell', dec(100), false).toString()).toBe('99.5');
    expect(closePrice(COSTS, 'buy', dec(100), true).toString()).toBe('99.4');
    expect(orderFillPrice(COSTS, 'buy', 'market', null, candle('100', '101', '99', '100'))?.toString()).toBe('100.6');
  });

  it('fills a limit only when price trades through it, at its own price, never with slippage', () => {
    // Buy limit at 98: the ask low is 97 + 0.5 = 97.5, below the limit, so it fills at 98.
    expect(orderFillPrice(COSTS, 'buy', 'limit', dec(98), candle('100', '101', '97', '99'))?.toString()).toBe('98');
    expect(orderFillPrice(COSTS, 'buy', 'limit', dec(98), candle('100', '101', '98', '99'))).toBeNull();
    // Gap down below the limit: still fills at the limit, never better.
    expect(orderFillPrice(COSTS, 'buy', 'limit', dec(98), candle('96', '97', '95', '96'))?.toString()).toBe('98');
    expect(orderFillPrice(COSTS, 'sell', 'limit', dec(102), candle('105', '106', '104', '105'))?.toString()).toBe('102');
  });

  it('a limit exactly reached fills only under the touch rule (through is the default)', () => {
    // Ask low = 97.5 + 0.5 = 98, exactly the limit.
    const c = candle('100', '101', '97.5', '99');
    expect(orderFillPrice(COSTS, 'buy', 'limit', dec(98), c)).toBeNull();
    expect(orderFillPrice({ ...COSTS, limitRule: 'touch' }, 'buy', 'limit', dec(98), c)?.toString()).toBe('98');
    expect(NO_COSTS.limitRule).toBe('through');
  });

  it('a take profit fills only when traded through, at its own price even on a gap', () => {
    expect(exitOnCandle(NO_COSTS, 'buy', null, dec(105), candle('100', '105', '99', '104'), false)).toBeNull();
    expect(exitOnCandle({ ...NO_COSTS, limitRule: 'touch' }, 'buy', null, dec(105), candle('100', '105', '99', '104'), false)).toEqual({ price: dec(105), reason: 'take_profit' });
    expect(exitOnCandle(NO_COSTS, 'buy', null, dec(105), candle('110', '111', '109', '110'), false)).toEqual({ price: dec(105), reason: 'take_profit' });
    expect(exitOnCandle(NO_COSTS, 'sell', null, dec(95), candle('90', '91', '89', '90'), false)).toEqual({ price: dec(95), reason: 'take_profit' });
  });

  it('fills a stop past a gap at the open, which is worse, plus slippage', () => {
    expect(orderFillPrice(COSTS, 'buy', 'stop', dec(102), candle('100', '103', '99', '102'))?.toString()).toBe('102.1');
    expect(orderFillPrice(COSTS, 'buy', 'stop', dec(102), candle('105', '106', '104', '105'))?.toString()).toBe('105.6');
  });

  it('assumes the stop filled first when one candle reaches both the stop and the target', () => {
    const exit = exitOnCandle(NO_COSTS, 'buy', dec(95), dec(105), candle('100', '106', '94', '100'), false);
    expect(exit).toEqual({ price: dec(95), reason: 'stop_loss' });
  });

  it('fills a stop loss at the open when price gaps through it', () => {
    expect(exitOnCandle(COSTS, 'buy', dec(95), null, candle('90', '91', '89', '90'), false)?.price.toString()).toBe('89.4');
    expect(exitOnCandle(COSTS, 'sell', dec(105), null, candle('110', '111', '109', '110'), false)?.price.toString()).toBe('110.6');
  });

  it('only checks the stop, at its level, on the candle a pending order filled inside', () => {
    const c = candle('100', '106', '94', '100');
    expect(exitOnCandle(NO_COSTS, 'buy', null, dec(105), c, true)).toBeNull();
    expect(exitOnCandle(NO_COSTS, 'buy', dec(96), dec(105), candle('100', '106', '90', '100'), true)?.price.toString()).toBe('96');
    expect(filledInsideCandle(NO_COSTS, 'buy', 'limit', dec(98), c)).toBe(true);
    // A gap past the limit counts as filled at the open; a limit equal to the open is not yet traded through.
    expect(filledInsideCandle(NO_COSTS, 'buy', 'limit', dec(101), c)).toBe(false);
    expect(filledInsideCandle(NO_COSTS, 'buy', 'limit', dec(100), c)).toBe(true);
    expect(filledInsideCandle(NO_COSTS, 'buy', 'market', dec(98), c)).toBe(false);
  });
});
