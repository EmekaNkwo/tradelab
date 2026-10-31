import { atr, bollinger, ema, macd, rsi, sma } from '../indicators';
import { createRng } from '../random';
import { candleIssues, generateScenario, SCENARIO_KINDS, SIMULATED_LABEL } from '../scenarios';

const near = (a: number | null | undefined, b: number, dp = 6) => expect(a!).toBeCloseTo(b, dp);

describe('seeded random', () => {
  it('is reproducible from the seed and stays in range', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(createRng(43).next()).not.toBe(xs[0]);
    const r = createRng(1);
    const ints = Array.from({ length: 200 }, () => r.int(2, 4));
    expect(new Set(ints)).toEqual(new Set([2, 3, 4]));
    expect(Number.isFinite(r.normal())).toBe(true);
  });
});

describe('indicators', () => {
  const xs = [1, 2, 3, 4, 5];

  it('SMA and EMA', () => {
    expect(sma(xs, 3)).toEqual([null, null, 2, 3, 4]);
    expect(ema(xs, 3)).toEqual([null, null, 2, 3, 4]);
    const e = ema([2, 4, 6, 8], 2);
    expect(e[0]).toBeNull();
    near(e[1], 3);
    near(e[2], 5);
    near(e[3], 7);
    expect(() => sma(xs, 0)).toThrow(RangeError);
  });

  it('RSI is 100 for only gains, 0 for only losses, 50 for no movement', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3).slice(3)).toEqual([100, 100, 100]);
    expect(rsi([6, 5, 4, 3, 2, 1], 3).slice(3)).toEqual([0, 0, 0]);
    expect(rsi([1, 1, 1, 1], 2).slice(2)).toEqual([50, 50]);
    expect(rsi([1, 2, 3], 3)).toEqual([null, null, null]);
  });

  it('RSI with Wilder smoothing', () => {
    // changes: +1, -1, +2 → first avg (period 2): gain 0.5, loss 0.5 → 50;
    // next: gain (0.5×1+2)/2 = 1.25, loss (0.5×1+0)/2 = 0.25 → RS 5 → 83.33…
    const r = rsi([10, 11, 10, 12], 2);
    near(r[2], 50);
    near(r[3], 100 - 100 / 6);
  });

  it('Bollinger bands use the population standard deviation', () => {
    const b = bollinger(xs, 5, 2);
    near(b.middle[4], 3);
    near(b.upper[4], 3 + 2 * Math.SQRT2);
    near(b.lower[4], 3 - 2 * Math.SQRT2);
    expect(b.upper[3]).toBeNull();
  });

  it('ATR uses true range with gaps and Wilder smoothing', () => {
    const candles = [
      { high: 10, low: 8, close: 9 },
      { high: 12, low: 11, close: 11.5 }, // gap: TR = 12 − 9 = 3
      { high: 11.5, low: 10, close: 10.5 }, // TR = 1.5
    ];
    const a = atr(candles, 2);
    expect(a[0]).toBeNull();
    near(a[1], (2 + 3) / 2);
    near(a[2], (2.5 * 1 + 1.5) / 2);
  });

  it('MACD histogram is the line minus the signal', () => {
    const closes = Array.from({ length: 60 }, (_x, i) => 100 + Math.sin(i / 4) * 5 + i * 0.1);
    const m = macd(closes);
    expect(m.macd).toHaveLength(60);
    expect(m.macd[24]).toBeNull();
    expect(m.macd[25]).not.toBeNull();
    expect(m.signal[32]).toBeNull();
    expect(m.signal[33]).not.toBeNull();
    near(m.histogram[50], (m.macd[50] as number) - (m.signal[50] as number));
    expect(macd([1, 2]).macd).toEqual([null, null]);
  });
});

describe('scenario generator', () => {
  it('is deterministic for the same kind, seed, and options', () => {
    const a = generateScenario({ kind: 'breakout', seed: 7, count: 120 });
    const b = generateScenario({ kind: 'breakout', seed: 7, count: 120 });
    expect(a.candles.map((c) => c.close.toString())).toEqual(b.candles.map((c) => c.close.toString()));
    expect(generateScenario({ kind: 'breakout', seed: 8, count: 120 }).candles[50]?.close.toString()).not.toBe(a.candles[50]?.close.toString());
  });

  it.each(SCENARIO_KINDS)('%s: valid candles, labelled simulated, spaced by the timeframe', (kind) => {
    const s = generateScenario({ kind, seed: 3, count: 200, timeframe: 'M15', precision: 5 });
    expect(s.label).toBe(SIMULATED_LABEL);
    expect(s.candles).toHaveLength(200);
    expect(candleIssues(s.candles)).toEqual([]);
    expect(Date.parse(s.candles[1]!.time) - Date.parse(s.candles[0]!.time)).toBe(15 * 60_000);
    expect(s.candles.every((c) => c.low.gt(0) && c.close.decimalPlaces() <= 5)).toBe(true);
  });

  it('trend scenarios move in the stated direction over several seeds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const up = generateScenario({ kind: 'strong_uptrend', seed, count: 300 });
      expect(up.candles.at(-1)!.close.gt(up.candles[0]!.open)).toBe(true);
      const down = generateScenario({ kind: 'downtrend', seed, count: 300 });
      expect(down.candles.at(-1)!.close.lt(down.candles[0]!.open)).toBe(true);
    }
  });

  it('breakouts record the range and the break index, and the break leaves the range', () => {
    for (const seed of [11, 12, 13]) {
      const s = generateScenario({ kind: 'breakout', seed, count: 200 });
      const { keyIndex, rangeHigh, rangeLow, overallTrend } = s.truth;
      expect(keyIndex).toBe(120);
      const last = Number(s.candles.at(-1)!.close);
      if (overallTrend === 'up') expect(last).toBeGreaterThan(rangeHigh!);
      else expect(last).toBeLessThan(rangeLow!);
    }
  });

  it('flags broken candles and out-of-order times', () => {
    const s = generateScenario({ kind: 'range', seed: 1, count: 3 });
    const [a, b] = s.candles;
    const broken = [{ ...a!, high: a!.low.minus(1) }, { ...b!, time: a!.time }];
    expect(candleIssues(broken)).toHaveLength(2);
  });
});

it('timeframes differ: longer candles move more, and each timeframe has its own path (Phase 4 review)', () => {
  const range = (tf: 'M15' | 'H1' | 'D1') => {
    const s = generateScenario({ kind: 'range', seed: 5, count: 200, timeframe: tf });
    const sizes = s.candles.map((c) => Number(c.high) - Number(c.low));
    return { avg: sizes.reduce((a, b) => a + b, 0) / sizes.length, closes: s.candles.map((c) => c.close.toString()) };
  };
  const m15 = range('M15');
  const h1 = range('H1');
  const d1 = range('D1');
  expect(h1.avg).toBeGreaterThan(m15.avg);
  expect(d1.avg).toBeGreaterThan(h1.avg * 3);
  expect(d1.closes).not.toEqual(h1.closes);
});
