import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import type { Candle } from '../../models/markets';
import {
  cancelOrders,
  closePosition,
  editPosition,
  nextCandle,
  placeOrder,
  replayView,
  startReplay,
  stepBack,
  type ReplayState,
} from '../replay';

/** [open, high, low, close] */
const series = (rows: readonly [number, number, number, number][]): Candle[] =>
  rows.map(([o, h, l, c], i) => ({
    time: new Date(Date.UTC(2020, 0, 1, i)).toISOString() as UtcIso,
    open: dec(o),
    high: dec(h),
    low: dec(l),
    close: dec(c),
    volume: null,
  }));

const DATA = series([
  [100, 101, 99, 100], // 0 revealed
  [100, 102, 99.5, 101], // 1
  [101, 104, 100.5, 103], // 2
  [103, 103.5, 97, 98], // 3
  [96, 97, 95, 96], // 4 gap down
]);

const start = (revealed = 1): ReplayState => {
  const r = startReplay(DATA, revealed, dec(1000));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};
const must = (r: { ok: true; value: ReplayState } | { ok: false; error: { message: string } }): ReplayState => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('replay engine', () => {
  it('never exposes upcoming candles in the view', () => {
    const s = start(2);
    const view = replayView(s);
    expect(view.candles).toHaveLength(2);
    expect(view.remaining).toBe(3);
    expect(Object.keys(view)).not.toContain('upcoming');
    expect(JSON.stringify(view)).not.toContain('"103.5"');
  });

  it('rejects invalid starts', () => {
    expect(startReplay(DATA, 0, dec(1000)).ok).toBe(false);
    expect(startReplay(DATA, 5, dec(1000)).ok).toBe(false);
    expect(startReplay(DATA, 1, dec(0)).ok).toBe(false);
  });

  it('a market order fills at the next open and the target closes it', () => {
    let s = must(placeOrder(start(), { side: 'buy', type: 'market', units: dec(10), stopLoss: dec(98), takeProfit: dec(103.5) }));
    expect(replayView(s).position).toBeNull();
    s = nextCandle(s); // fills at 100
    expect(replayView(s).position?.entry.toString()).toBe('100');
    expect(replayView(s).equity.toString()).toBe('1010');
    s = nextCandle(s); // high 104 ≥ 103.5
    const [trade] = replayView(s).closed;
    expect(trade).toMatchObject({ reason: 'take_profit' });
    expect(trade!.profit.toString()).toBe('35');
    expect(replayView(s).balance.toString()).toBe('1035');
  });

  it('a gap through the stop fills at the open, not the stop price', () => {
    let s = start(3);
    s = must(placeOrder(s, { side: 'buy', type: 'market', units: dec(1), stopLoss: dec(97.5) }));
    s = nextCandle(s); // fills at 103, low 97 ≤ 97.5 → stop at 97.5
    expect(replayView(s).closed[0]).toMatchObject({ reason: 'stop_loss' });
    expect(replayView(s).closed[0]!.exit.toString()).toBe('97.5');

    let g = start(4);
    g = must(placeOrder(g, { side: 'sell', type: 'market', units: dec(1), stopLoss: dec(100) }));
    g = nextCandle(g); // sell fills at 96 (last candle), closes at end of data
    expect(replayView(g).closed[0]).toMatchObject({ reason: 'end_of_data' });
  });

  it('a candle that hits both stop and target counts the stop first', () => {
    let s = start(3);
    s = must(placeOrder(s, { side: 'buy', type: 'limit', units: dec(1), price: dec(97.5), stopLoss: dec(96.5), takeProfit: dec(98) }));
    s = nextCandle(s); // candle 3: low 97 ≤ 97.5 fills inside the candle; its high came before the entry, so no target yet
    expect(replayView(s).closed).toEqual([]);
    expect(replayView(s).position?.entry.toString()).toBe('97.5');

    let i = start(3);
    i = must(placeOrder(i, { side: 'buy', type: 'limit', units: dec(1), price: dec(97.5), stopLoss: dec(97.2) }));
    i = nextCandle(i); // fills at 97.5, low 97 ≤ 97.2: stop at its exact level
    expect(replayView(i).closed[0]!.exit.toString()).toBe('97.2');

    let t = start(3);
    t = must(placeOrder(t, { side: 'buy', type: 'market', units: dec(1), stopLoss: dec(98), takeProfit: dec(103.2) }));
    t = nextCandle(t); // opens 103, high 103.5 ≥ 103.2 and low 97 ≤ 98 → stop first
    expect(replayView(t).closed[0]).toMatchObject({ reason: 'stop_loss' });
  });

  it('pending orders must sit on the correct side of the price and fill at the open after a gap', () => {
    const s = start(4); // last close 98
    expect(placeOrder(s, { side: 'buy', type: 'limit', units: dec(1), price: dec(99) }).ok).toBe(false);
    expect(placeOrder(s, { side: 'buy', type: 'stop', units: dec(1), price: dec(97) }).ok).toBe(false);
    expect(placeOrder(s, { side: 'buy', type: 'limit', units: dec(1) }).ok).toBe(false);
    const filled = nextCandle(must(placeOrder(s, { side: 'sell', type: 'stop', units: dec(1), price: dec(97) })));
    // Candle 4 opens 96, below the 97 sell stop: filled at the open.
    expect(replayView(filled).closed[0]?.entry.toString()).toBe('96');
  });

  it('validates stop and target sides, size, and one trade at a time', () => {
    const s = start();
    expect(placeOrder(s, { side: 'buy', type: 'market', units: dec(1), stopLoss: dec(101) }).ok).toBe(false);
    expect(placeOrder(s, { side: 'sell', type: 'market', units: dec(1), takeProfit: dec(101) }).ok).toBe(false);
    expect(placeOrder(s, { side: 'buy', type: 'market', units: dec(0) }).ok).toBe(false);
    const placed = must(placeOrder(s, { side: 'buy', type: 'market', units: dec(1) }));
    expect(placeOrder(placed, { side: 'buy', type: 'market', units: dec(1) }).ok).toBe(false);
    expect(replayView(cancelOrders(placed)).orders).toEqual([]);
    expect(cancelOrders(s)).toBe(s);
  });

  it('partial and full manual closes at the last close; edit levels', () => {
    let s = nextCandle(must(placeOrder(start(), { side: 'buy', type: 'market', units: dec(10) }))); // entry 100, close 101
    expect(editPosition(s, dec(102), null).ok).toBe(false);
    s = must(editPosition(s, dec(99), dec(110)));
    s = must(closePosition(s, dec('0.5')));
    expect(replayView(s).position?.units.toString()).toBe('5');
    expect(replayView(s).closed[0]!.profit.toString()).toBe('5');
    s = must(closePosition(s));
    expect(replayView(s).position).toBeNull();
    expect(replayView(s).balance.toString()).toBe('1010');
    expect(closePosition(s).ok).toBe(false);
    expect(editPosition(s, null, null).ok).toBe(false);
  });

  it('steps back through history, and does nothing past the start or the end', () => {
    const s0 = start(3);
    const s1 = nextCandle(s0);
    const s2 = nextCandle(s1);
    expect(replayView(s2).finished).toBe(true);
    expect(nextCandle(s2)).toBe(s2);
    expect(placeOrder(s2, { side: 'buy', type: 'market', units: dec(1) }).ok).toBe(false);
    expect(replayView(stepBack(s2)).candles).toHaveLength(4);
    expect(replayView(stepBack(stepBack(s2))).candles).toHaveLength(3);
    expect(stepBack(s0)).toBe(s0);
    expect(replayView(s1).canStepBack).toBe(true);
  });
});

it('remembers the stop set at entry even after the stop is moved', () => {
  let s = must(placeOrder(start(), { side: 'buy', type: 'market', units: dec(1), stopLoss: dec(98) }));
  s = nextCandle(s); // fills at 100, candle 1 closes 101
  s = must(editPosition(s, dec(100.5), null));
  s = must(closePosition(s));
  const t = replayView(s).closed[0]!;
  expect(t.initialStop!.toString()).toBe('98');
});

describe('fill rules not covered above (Phase 4 review)', () => {
  const lastTrade = (s: ReplayState) => replayView(s).closed.at(-1)!;

  it('sell market: fills at the next open and is stopped above', () => {
    let s = must(placeOrder(start(), { side: 'sell', type: 'market', units: dec(1), stopLoss: dec(103.2), takeProfit: dec(97.5) }));
    s = nextCandle(s); // fills at 100; candle 1 touches neither level
    expect(replayView(s).position!.entry.toString()).toBe('100');
    s = nextCandle(s); // candle 2 high 104 reaches the stop
    expect(lastTrade(s)).toMatchObject({ reason: 'stop_loss' });
    expect(lastTrade(s).exit.toString()).toBe('103.2');
    expect(lastTrade(s).profit.toString()).toBe('-3.2');
  });

  it('closes an open trade at the last close when the data ends', () => {
    let s = must(placeOrder(start(3), { side: 'buy', type: 'market', units: dec(1) }));
    s = nextCandle(s); // fills at 103
    s = nextCandle(s); // last candle, closes 96
    expect(lastTrade(s)).toMatchObject({ reason: 'end_of_data' });
    expect(lastTrade(s).profit.toString()).toBe('-7');
    expect(replayView(s).finished).toBe(true);
  });

  it('buy stop entered inside a candle can be stopped on that candle, at the exact stop', () => {
    let s = must(placeOrder(start(), { side: 'buy', type: 'stop', units: dec(1), price: dec(101.5), stopLoss: dec(99.8), takeProfit: dec(103) }));
    s = nextCandle(s); // candle 1 [100,102,99.5,101]: entry 101.5, low 99.5 reaches 99.8
    expect(lastTrade(s)).toMatchObject({ reason: 'stop_loss' });
    expect(lastTrade(s).entry.toString()).toBe('101.5');
    expect(lastTrade(s).exit.toString()).toBe('99.8');
  });

  it('a take profit waits until the candle after an intrabar entry', () => {
    let s = must(placeOrder(start(), { side: 'buy', type: 'limit', units: dec(1), price: dec(99.6), stopLoss: dec(98), takeProfit: dec(101.5) }));
    s = nextCandle(s); // fills 99.6; high 102 would reach the target but is not counted
    expect(replayView(s).position!.entry.toString()).toBe('99.6');
    s = nextCandle(s); // candle 2 opens 101, high 104 → target at 101.5
    expect(lastTrade(s)).toMatchObject({ reason: 'take_profit' });
    expect(lastTrade(s).exit.toString()).toBe('101.5');
  });

  it('sell limit: when one candle reaches both levels, the stop is assumed first', () => {
    let s = must(placeOrder(start(), { side: 'sell', type: 'limit', units: dec(1), price: dec(101.8), stopLoss: dec(103.8), takeProfit: dec(100.6) }));
    s = nextCandle(s); // fills 101.8 inside candle 1
    s = nextCandle(s); // candle 2 [101,104,100.5,103] touches both
    expect(lastTrade(s)).toMatchObject({ reason: 'stop_loss' });
    expect(lastTrade(s).profit.toString()).toBe('-2');
  });
});

it('refuses new orders once the simulated balance is used up (Phase 4 review)', () => {
  const r = startReplay(DATA, 1, dec(1));
  if (!r.ok) throw new Error(r.error.message);
  let s = must(placeOrder(r.value, { side: 'buy', type: 'market', units: dec(10) }));
  s = nextCandle(s); // fills at 100, candle 1 closes 101
  s = nextCandle(s); // candle 2 closes 103
  s = nextCandle(s); // candle 3 closes 98
  s = must(closePosition(s)); // loss of 20 on a balance of 1
  expect(replayView(s).balance.isNegative()).toBe(true);
  const refused = placeOrder(s, { side: 'buy', type: 'market', units: dec(1) });
  expect(!refused.ok && refused.error.message).toMatch(/balance is used up/);
});
