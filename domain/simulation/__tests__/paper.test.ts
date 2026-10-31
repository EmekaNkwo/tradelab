import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import type { Candle } from '../../models/markets';
import {
  advancePaper,
  cancelPaperOrder,
  closePaperPosition,
  closedPositions,
  consecutiveLosses,
  editPaperPosition,
  PRACTICE_INSTRUMENTS,
  paperView,
  placePaperOrder,
  plannedLoss,
  practiceInstrument,
  startPaper,
  type PaperOrderRequest,
  type PaperState,
  type PracticeInstrument,
} from '..';

/** A test instrument with round numbers: spread 2 (half is 1), slippage 1, commission 1 per side. */
const T: PracticeInstrument = {
  id: 't',
  symbol: 'T',
  name: 'Test',
  market: 'forex',
  startPrice: 100,
  precision: 2,
  sizeUnit: 'lots',
  contractSize: dec(1),
  minSize: dec(1),
  sizeStep: dec(1),
  maxOrderSize: dec(50),
  pipSize: dec(1),
  spread: dec(2),
  slippage: dec(1),
  commissionPerSide: dec(1),
  margin: { kind: 'rate', rate: dec('0.5') },
  stopOutLevel: dec('0.5'),
  swapLong: dec(-1),
  swapShort: dec('0.5'),
  allowShort: true,
  notes: [],
};

const c = (time: string, o: number, h: number, l: number, cl: number): Candle => ({
  time: `${time}:00:00.000Z` as UtcIso,
  open: dec(o),
  high: dec(h),
  low: dec(l),
  close: dec(cl),
  volume: null,
});

const must = <V>(r: { ok: true; value: V } | { ok: false; error: { message: string } }): V => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const order = (o: Partial<PaperOrderRequest>): PaperOrderRequest => ({
  side: 'buy',
  type: 'market',
  size: dec(1),
  price: null,
  stopLoss: null,
  takeProfit: null,
  violations: [],
  plannedRisk: null,
  equityAtOrder: dec(1000),
  ...o,
});

const start = (candles: readonly Candle[], balance = 1000): PaperState => must(startPaper(T, candles, 0, dec(balance)));

describe('paper trading fills and costs', () => {
  const DATA = [
    c('2020-01-01T00', 100, 101, 99, 100),
    c('2020-01-01T01', 101, 105, 99, 104),
    c('2020-01-02T00', 110, 125, 108, 118),
    c('2020-01-02T01', 118, 119, 117, 118),
  ];

  it('fills a market buy at the next open plus half the spread and slippage, charges swap, and takes profit', () => {
    let s = must(placePaperOrder(start(DATA), T, DATA, order({ stopLoss: dec(90), takeProfit: dec(120) })));
    s = advancePaper(s, T, DATA);
    // 101 open + 1 half spread + 1 slippage.
    expect(s.positions[0]!.entry.toString()).toBe('103');
    expect(s.positions[0]!.carried.toString()).toBe('-1');
    // Bid at the close is 103: no move, minus the entry commission.
    expect(paperView(s, T, DATA).equity.toString()).toBe('999');
    s = advancePaper(s, T, DATA);
    // New day: swap −1. The bid high 124 reaches the 120 target; the bid open 109 did not gap past it.
    const t = s.history[0]!;
    expect([t.reason, t.exit.toString(), t.gross.toString(), t.costs.toString(), t.net.toString()]).toEqual(['take_profit', '120', '17', '-3', '14']);
    expect(s.balance.toString()).toBe('1014');
    expect(s.dayStartBalance.toString()).toBe('1000');
  });

  it('assumes the stop fills first when one candle reaches both, and fills gaps at the open', () => {
    const data = [c('2020-01-01T00', 100, 101, 99, 100), c('2020-01-01T01', 100, 101, 99, 100), c('2020-01-01T02', 95, 130, 80, 100), c('2020-01-01T03', 100, 100, 100, 100)];
    let s = must(placePaperOrder(start(data), T, data, order({ stopLoss: dec(97), takeProfit: dec(110) })));
    s = advancePaper(advancePaper(s, T, data), T, data);
    // Bid open 94 is already below the 97 stop (a gap): fills at 94, then slippage 1.
    expect([s.history[0]!.reason, s.history[0]!.exit.toString()]).toEqual(['stop_loss', '93']);
  });

  it('fills a sell limit on the bid and checks only the stop on its entry candle', () => {
    const data = [c('2020-01-01T00', 100, 101, 99, 100), c('2020-01-01T01', 100, 107, 90, 95), c('2020-01-01T02', 95, 96, 90, 92)];
    let s = must(placePaperOrder(start(data), T, data, order({ side: 'sell', type: 'limit', price: dec(105), stopLoss: dec(110), takeProfit: dec(95) })));
    s = advancePaper(s, T, data);
    // Bid high 106 reaches 105; no slippage on a limit. The low would hit the target, but that waits a candle.
    expect(s.positions[0]!.entry.toString()).toBe('105');
    s = advancePaper(s, T, data);
    // Ask low 91 ≤ 95: target at 95 (ask open 96 had not gapped past it).
    expect([s.history[0]!.reason, s.history[0]!.exit.toString(), s.history[0]!.gross.toString()]).toEqual(['take_profit', '95', '10']);
  });

  it('closes part of a position, moves its stop, and keeps costs in proportion', () => {
    const data = [c('2020-01-01T00', 100, 101, 99, 100), c('2020-01-01T01', 100, 101, 99, 100), c('2020-01-01T02', 100, 101, 99, 106), c('2020-01-01T03', 106, 106, 106, 106)];
    let s = must(placePaperOrder(start(data), T, data, order({ size: dec(4), stopLoss: dec(90) })));
    s = advancePaper(advancePaper(s, T, data), T, data);
    expect(editPaperPosition(s, T, data, 99, dec(95), null).ok).toBe(false);
    expect(editPaperPosition(s, T, data, s.positions[0]!.id, dec(106), null).ok).toBe(false);
    s = must(editPaperPosition(s, T, data, s.positions[0]!.id, dec(100), null));
    // Entry 102 → stop 100 on 4 lots: 8, plus 4 entry and 4 exit commission.
    expect(paperView(s, T, data).riskAtStops?.toString()).toBe('16');
    s = must(closePaperPosition(s, T, data, s.positions[0]!.id, dec(1)));
    // Entry 102; manual close on the bid 105 minus slippage 1 = 104. Costs: a quarter of the entry commission (−1) and the exit commission (−1).
    expect([s.history[0]!.exit.toString(), s.history[0]!.gross.toString(), s.history[0]!.costs.toString()]).toEqual(['104', '2', '-2']);
    expect(s.positions[0]!.size.toString()).toBe('3');
    expect(s.positions[0]!.initialStop?.toString()).toBe('90');
    expect(closePaperPosition(s, T, data, s.positions[0]!.id, dec(4)).ok).toBe(false);
  });
});

describe('paper trading limits', () => {
  const DATA = [c('2020-01-01T00', 100, 101, 99, 100), c('2020-01-01T01', 100, 101, 99, 100), c('2020-01-01T02', 60, 61, 59, 60), c('2020-01-01T03', 60, 60, 60, 60)];

  it('refuses orders without enough margin, of the wrong size, or on the wrong side of the price', () => {
    const s = start(DATA);
    expect(placePaperOrder(s, T, DATA, order({ size: dec(20) })).ok).toBe(true);
    const tooBig = placePaperOrder(s, T, DATA, order({ size: dec(21) }));
    expect(!tooBig.ok && tooBig.error.message).toMatch(/Not enough free funds: this needs 1050.00/);
    expect(placePaperOrder(s, T, DATA, order({ size: dec('1.5') })).ok).toBe(false);
    expect(placePaperOrder(start(DATA, 100000), T, DATA, order({ size: dec(51) })).ok).toBe(false);
    expect(placePaperOrder(s, T, DATA, order({ type: 'limit', price: dec(101) })).ok).toBe(false);
    expect(placePaperOrder(s, T, DATA, order({ stopLoss: dec(101) })).ok).toBe(false);
    expect(placePaperOrder(s, T, DATA, order({ side: 'sell', takeProfit: dec(101) })).ok).toBe(false);
  });

  it('stops out when equity falls below the stop-out level', () => {
    let s = must(placePaperOrder(start(DATA), T, DATA, order({ size: dec(19) })));
    s = advancePaper(advancePaper(s, T, DATA), T, DATA);
    expect(s.positions).toEqual([]);
    expect(s.history[0]!.reason).toBe('stop_out');
    expect(s.events.join(' ')).toMatch(/Stop out/);
    expect(s.maxDrawdown.gt(0.5)).toBe(true);
  });

  it('closes positions and cancels orders at the end of the data, then refuses new orders', () => {
    let s = must(placePaperOrder(start(DATA), T, DATA, order({})));
    s = must(placePaperOrder(s, T, DATA, order({ type: 'limit', price: dec(50) })));
    s = must(cancelPaperOrder(s, s.orders[1]!.id));
    expect(cancelPaperOrder(s, 42).ok).toBe(false);
    s = must(placePaperOrder(s, T, DATA, order({ type: 'limit', price: dec(40) })));
    for (let k = 0; k < 5; k += 1) s = advancePaper(s, T, DATA);
    expect(s.cursor).toBe(3);
    expect(s.positions).toEqual([]);
    expect(s.orders).toEqual([]);
    expect(paperView(s, T, DATA).finished).toBe(true);
    expect(placePaperOrder(s, T, DATA, order({})).ok).toBe(false);
  });

  it('the view never contains candles after the cursor', () => {
    const s = start(DATA);
    expect(paperView(s, T, DATA).candles).toHaveLength(1);
    expect(paperView(s, T, DATA).remaining).toBe(3);
  });

  it('counts losing trades in a row from the end', () => {
    const t = (positionId: number, net: number) => ({ positionId, net: dec(net), plannedRisk: dec(10) }) as never;
    expect(consecutiveLosses([t(1, -1), t(2, 5), t(3, -2), t(4, -3)])).toBe(2);
    expect(consecutiveLosses([])).toBe(0);
    // Two partial closes of position 3 are one losing trade, not two.
    expect(consecutiveLosses([t(2, 5), t(3, -1), t(3, -1)])).toBe(1);
    expect(closedPositions([t(3, -1), t(3, -2)]).map((c) => [c.net.toString(), c.plannedRisk?.toString()])).toEqual([['-3', '20']]);
  });

  it('planned loss includes the half spread paid on entry and both commissions', () => {
    // Buy at mid 100, stop 90: distance 10 + half spread 1 = 11 per unit × 2, + 2 commissions × 2.
    expect(plannedLoss(T, 'buy', dec(2), dec(100), dec(90)).toString()).toBe('26');
  });
});

describe('practice instruments', () => {
  it('covers every market with different mechanics, and cash accounts cannot short', () => {
    expect(PRACTICE_INSTRUMENTS.map((i) => i.market)).toEqual(['forex', 'stocks', 'penny_stocks', 'commodities', 'futures']);
    const stock = practiceInstrument('sim-stock')!;
    const data = [c('2020-01-01T00', 85, 86, 84, 85), c('2020-01-01T01', 85, 86, 84, 85)];
    const s = must(startPaper(stock, data, 0, dec(10000)));
    expect(placePaperOrder(s, stock, data, order({ side: 'sell', size: dec(10) })).ok).toBe(false);
    // Cash: the full price is locked. 117 shares × 85 = 9945 fits in 10,000; 118 does not.
    expect(placePaperOrder(s, stock, data, order({ size: dec(117) })).ok).toBe(true);
    expect(placePaperOrder(s, stock, data, order({ size: dec(118) })).ok).toBe(false);
    expect(practiceInstrument('nope')).toBeNull();
    for (const i of PRACTICE_INSTRUMENTS) expect(i.notes.length).toBeGreaterThan(0);
  });

  it('futures use a fixed margin per contract', () => {
    const fut = practiceInstrument('sim-index-future')!;
    const data = [c('2020-01-01T00', 4500, 4501, 4499, 4500), c('2020-01-01T01', 4500, 4501, 4499, 4500)];
    const s = must(startPaper(fut, data, 0, dec(25000)));
    expect(placePaperOrder(s, fut, data, order({ size: dec(2) })).ok).toBe(true);
    expect(placePaperOrder(s, fut, data, order({ size: dec(3) })).ok).toBe(false);
  });
});
