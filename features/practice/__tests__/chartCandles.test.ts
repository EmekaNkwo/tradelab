import { generateScenario } from '../../../domain/market';
import { toChartCandles } from '../chartModel';

/**
 * Phase 12 performance: the replay screen converts the revealed candles on
 * every tick. Candles are immutable and shared between replay states, so
 * each one is converted once and reused; a tick only converts the new one.
 */

const SERIES = generateScenario({ kind: 'pullback', seed: 9, timeframe: 'H1', count: 400 }).candles;

describe('toChartCandles', () => {
  it('converts each candle to plain numbers', () => {
    const [first] = toChartCandles(SERIES.slice(0, 1));
    const c = SERIES[0]!;
    expect(first).toEqual({ time: c.time, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: c.volume === null ? null : Number(c.volume) });
  });

  it('reuses the converted candle when the same candle appears again, as on the next replay tick', () => {
    const before = toChartCandles(SERIES.slice(0, 200));
    const after = toChartCandles(SERIES.slice(0, 201));
    expect(after).toHaveLength(201);
    for (let i = 0; i < 200; i += 1) expect(after[i]).toBe(before[i]);
    expect(after[200]).toEqual(toChartCandles([SERIES[200]!])[0]);
  });

  it('returns a new array each time, so the caller can rely on identity for memoising', () => {
    const a = toChartCandles(SERIES.slice(0, 10));
    const b = toChartCandles(SERIES.slice(0, 10));
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
