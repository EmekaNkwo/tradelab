import { dec } from '../../../shared/decimal';
import {
  marginRequired,
  marginStatus,
  parsePair,
  pipSizeFor,
  pipValue,
  positionSize,
  profitLoss,
  riskReward,
  STANDARD_LOT,
} from '../forex';

const value = <T>(r: { ok: true; value: T } | { ok: false }) => {
  if (!r.ok) throw new Error('expected ok');
  return r.value;
};
const str = (d: { toString(): string }) => d.toString();

describe('parsePair', () => {
  it('accepts EUR/USD, eurusd and EUR-USD', () => {
    expect(value(parsePair('EUR/USD'))).toEqual({ base: 'EUR', quote: 'USD' });
    expect(value(parsePair('eurusd'))).toEqual({ base: 'EUR', quote: 'USD' });
    expect(value(parsePair(' gbp-jpy '))).toEqual({ base: 'GBP', quote: 'JPY' });
  });

  it('refuses metals, crypto, and unknown codes', () => {
    expect(parsePair('XAU/USD').ok).toBe(false);
    expect(parsePair('BTCUSD').ok).toBe(false);
    expect(pipValue({ pair: 'EUR/USD', lots: '1', accountCurrency: 'ABC', price: '1.1' }).ok).toBe(false);
  });

  it('accepts a comma as the decimal separator', () => {
    expect(value(pipValue({ pair: 'EUR/USD', lots: '0,5', accountCurrency: 'USD', price: '1,1' })).inAccount.toString()).toBe('5');
    expect(value(marginStatus({ equity: '-12,5', usedMargin: '10' })).freeMargin.toString()).toBe('-22.5');
  });

  it('rejects malformed pairs and same-currency pairs', () => {
    expect(parsePair('EURO/USD').ok).toBe(false);
    expect(parsePair('USD/USD').ok).toBe(false);
    expect(parsePair('').ok).toBe(false);
  });
});

describe('pipSizeFor', () => {
  it('is 0.01 for JPY-quoted pairs and 0.0001 otherwise', () => {
    expect(str(pipSizeFor({ base: 'USD', quote: 'JPY' }))).toBe('0.01');
    expect(str(pipSizeFor({ base: 'EUR', quote: 'USD' }))).toBe('0.0001');
  });
});

describe('pipValue', () => {
  it('quote currency = account currency: 1 lot EUR/USD is 10 USD per pip', () => {
    const r = value(pipValue({ pair: 'EUR/USD', lots: '1', accountCurrency: 'USD', price: '1.1000' }));
    expect(str(r.inQuote)).toBe('10');
    expect(str(r.inAccount)).toBe('10');
  });

  it('base currency = account currency: divides by the price', () => {
    // USD/JPY 0.1 lot: 10,000 × 0.01 = 100 JPY per pip; at 150.00 that is 0.666… USD.
    const r = value(pipValue({ pair: 'USD/JPY', lots: '0.1', accountCurrency: 'USD', price: '150' }));
    expect(str(r.inQuote)).toBe('100');
    expect(r.inAccount.toDecimalPlaces(4).toString()).toBe('0.6667');
  });

  it('cross: needs the quote-to-account rate', () => {
    // EUR/GBP 1 lot = 10 GBP per pip; 1 GBP = 1.25 USD → 12.5 USD.
    expect(pipValue({ pair: 'EUR/GBP', lots: '1', accountCurrency: 'USD', price: '0.85' }).ok).toBe(false);
    const r = value(pipValue({ pair: 'EUR/GBP', lots: '1', accountCurrency: 'USD', price: '0.85', quoteToAccountRate: '1.25' }));
    expect(str(r.inAccount)).toBe('12.5');
  });

  it('rejects zero, negative, and non-numeric inputs', () => {
    expect(pipValue({ pair: 'EUR/USD', lots: '0', accountCurrency: 'USD', price: '1.1' }).ok).toBe(false);
    expect(pipValue({ pair: 'EUR/USD', lots: '-1', accountCurrency: 'USD', price: '1.1' }).ok).toBe(false);
    expect(pipValue({ pair: 'EUR/USD', lots: 'abc', accountCurrency: 'USD', price: '1.1' }).ok).toBe(false);
    expect(pipValue({ pair: 'EUR/USD', lots: '1', accountCurrency: 'usd1', price: '1.1' }).ok).toBe(false);
  });
});

describe('positionSize', () => {
  it('sizes to the risk budget and rounds down to the lot step', () => {
    // 1% of 5,000 = 50 USD; 25-pip stop × 10 USD/pip/lot = 250 USD per lot → 0.2 lot.
    const r = value(positionSize({ balance: '5000', riskPercent: '1', stopPips: '25', pipValuePerLot: '10' }));
    expect(str(r.lots)).toBe('0.2');
    expect(str(r.riskAmount)).toBe('50');
    expect(str(r.actualRisk)).toBe('50');
  });

  it('never rounds up past the budget', () => {
    // 1% of 1,000 = 10; 30 pips × 10 = 300 per lot → 0.0333… → 0.03 lot, actual risk 9.
    const r = value(positionSize({ balance: '1000', riskPercent: '1', stopPips: '30', pipValuePerLot: '10' }));
    expect(str(r.lots)).toBe('0.03');
    expect(str(r.actualRisk)).toBe('9');
  });

  it('reports when even the smallest lot is too big', () => {
    const r = value(positionSize({ balance: '100', riskPercent: '1', stopPips: '50', pipValuePerLot: '10' }));
    expect(str(r.lots)).toBe('0');
    expect(r.belowMinimumLot).toBe(true);
  });

  it('rejects a risk above 100% or a zero stop', () => {
    expect(positionSize({ balance: '1000', riskPercent: '101', stopPips: '10', pipValuePerLot: '10' }).ok).toBe(false);
    expect(positionSize({ balance: '1000', riskPercent: '1', stopPips: '0', pipValuePerLot: '10' }).ok).toBe(false);
  });
});

describe('marginRequired', () => {
  it('account in quote currency: units × price ÷ leverage', () => {
    // 1 lot EUR/USD at 1.10, 1:30 → 110,000 / 30 = 3,666.67 USD.
    const r = value(marginRequired({ pair: 'EUR/USD', lots: '1', price: '1.10', leverage: '30', accountCurrency: 'USD' }));
    expect(str(r.notionalInAccount)).toBe('110000');
    expect(r.margin.toDecimalPlaces(2).toString()).toBe('3666.67');
  });

  it('account in base currency: units ÷ leverage', () => {
    const r = value(marginRequired({ pair: 'USD/JPY', lots: '0.5', price: '150', leverage: '50', accountCurrency: 'USD' }));
    expect(str(r.margin)).toBe('1000');
  });

  it('cross: needs the base-to-account rate', () => {
    expect(marginRequired({ pair: 'EUR/GBP', lots: '1', price: '0.85', leverage: '30', accountCurrency: 'USD' }).ok).toBe(false);
    const r = value(marginRequired({ pair: 'EUR/GBP', lots: '1', price: '0.85', leverage: '20', accountCurrency: 'USD', baseToAccountRate: '1.10' }));
    expect(str(r.margin)).toBe('5500');
  });
});

describe('marginStatus', () => {
  it('computes free margin and margin level', () => {
    const r = value(marginStatus({ equity: '1200', usedMargin: '400' }));
    expect(str(r.freeMargin)).toBe('800');
    expect(str(r.marginLevelPercent!)).toBe('300');
  });

  it('has no margin level with no open positions', () => {
    expect(value(marginStatus({ equity: '1000', usedMargin: '0' })).marginLevelPercent).toBeNull();
  });

  it('allows negative equity (a loss bigger than the balance) but not negative margin', () => {
    expect(str(value(marginStatus({ equity: '-50', usedMargin: '100' })).freeMargin)).toBe('-150');
    expect(marginStatus({ equity: '100', usedMargin: '-1' }).ok).toBe(false);
  });
});

describe('profitLoss', () => {
  it('buy: (exit − entry) × units, in pips and money', () => {
    const r = value(profitLoss({ pair: 'EUR/USD', side: 'buy', entry: '1.1000', exit: '1.1050', lots: '0.1', accountCurrency: 'USD' }));
    expect(str(r.pips)).toBe('50');
    expect(str(r.inAccount)).toBe('50');
  });

  it('sell: profits when price falls, loses when it rises', () => {
    const win = value(profitLoss({ pair: 'GBP/USD', side: 'sell', entry: '1.2500', exit: '1.2450', lots: '1', accountCurrency: 'USD' }));
    expect(str(win.inAccount)).toBe('500');
    const loss = value(profitLoss({ pair: 'GBP/USD', side: 'sell', entry: '1.2500', exit: '1.2520', lots: '1', accountCurrency: 'USD' }));
    expect(str(loss.inAccount)).toBe('-200');
    expect(str(loss.pips)).toBe('-20');
  });

  it('converts a JPY-quoted result to a USD account at the exit price', () => {
    // USD/JPY buy 150.00 → 151.00, 0.1 lot: 10,000 × 1.00 = 10,000 JPY; ÷ 151 = 66.225… USD.
    const r = value(profitLoss({ pair: 'USD/JPY', side: 'buy', entry: '150', exit: '151', lots: '0.1', accountCurrency: 'USD' }));
    expect(str(r.inQuote)).toBe('10000');
    expect(r.inAccount.toDecimalPlaces(2).toString()).toBe('66.23');
  });
});

describe('riskReward', () => {
  it('measures reward per unit of risk for buys and sells', () => {
    expect(str(value(riskReward({ side: 'buy', entry: '1.1000', stop: '1.0980', target: '1.1060' })).ratio)).toBe('3');
    expect(str(value(riskReward({ side: 'sell', entry: '1.2500', stop: '1.2520', target: '1.2470' })).ratio)).toBe('1.5');
  });

  it('rejects a stop or target on the wrong side', () => {
    expect(riskReward({ side: 'buy', entry: '1.1', stop: '1.2', target: '1.3' }).ok).toBe(false);
    expect(riskReward({ side: 'sell', entry: '1.1', stop: '1.2', target: '1.15' }).ok).toBe(false);
  });
});

it('a standard lot is 100,000 units of the base currency', () => {
  expect(STANDARD_LOT.equals(dec(100000))).toBe(true);
});
