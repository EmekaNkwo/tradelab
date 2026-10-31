import { dec } from '../../../shared/decimal';
import type { Candle } from '../../models/markets';
import type { BacktestCosts } from '../costs';
import { comparisonIssues, type ComparableRun } from '../compare';
import { checkCandles, type Dataset, type Regime } from '../dataset';
import type { SplitRule } from '../engine';
import type { ConditionGroup, StrategyDefinition } from '../model';
import { BACKTEST_CONVENTIONS, inputHash, normaliseCosts, runBacktest, type RunContext } from '../result';
import { windowAverage } from '../signals';
import { templateFor } from '../templates';
import { op, TREND } from './testDefinitions';

/** Hand-built candles that make each engine rule visible (review probes p1–p11). */

const T0 = Date.parse('2024-01-01T00:00:00.000Z');
const num = (value: number) => ({ kind: 'number' as const, value });
const ZERO: BacktestCosts = { spread: '0', slippage: '0', commissionPerSide: '0', swapLong: '0', swapShort: '0' };
const FLAT = [100, 101, 99, 100];

function candles(rows: readonly number[][]): Candle[] {
  return rows.map(([o, h, l, c], i) => ({ time: new Date(T0 + i * 3600_000).toISOString() as Candle['time'], open: dec(o!), high: dec(h!), low: dec(l!), close: dec(c!), volume: null }));
}

function dataset(cs: Candle[], regimes?: Regime[]): Dataset {
  return { spec: { instrumentId: 'sim-stock', timeframe: 'H1', seed: 0, candles: cs.length }, origin: 'simulated', label: 'x', description: 'x', candles: cs, regimes: regimes ?? cs.map(() => 'ranging' as const) } as Dataset;
}

const closeAbove = (x: number): ConditionGroup => ({ join: 'all', conditions: [{ left: op('close'), op: 'above', right: num(x) }] });

function def(p: Partial<StrategyDefinition>): StrategyDefinition {
  return {
    instrumentId: 'sim-stock',
    timeframe: 'H1',
    direction: 'long',
    longEntry: closeAbove(1e9),
    shortEntry: null,
    longExit: null,
    shortExit: null,
    stop: { kind: 'percent', percent: 10 },
    target: { kind: 'none' },
    riskPercent: 1,
    limits: { maxTradesPerDay: 20, dailyLossPercent: null, pauseAfterLosses: null },
    session: null,
    ...p,
  };
}

function go(d: StrategyDefinition, rows: readonly number[][], options: { split?: SplitRule; regimes?: Regime[]; context?: RunContext } = {}) {
  const r = runBacktest({ definition: d, dataset: dataset(candles(rows), options.regimes), capital: dec(10000), costs: ZERO, split: options.split ?? { kind: 'none' } }, options.context);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const flat = (n: number, at: Record<number, number[]> = {}) => Array.from({ length: n }, (_v, i) => at[i] ?? FLAT);

describe('engine review fixes', () => {
  it('applies session hours to the candle the trade opens on', () => {
    const session = { startHourUtc: 8, endHourUtc: 17 };
    // Signal on the 07:00 candle; it fills at the 08:00 open, inside the session.
    const early = go(def({ longEntry: closeAbove(104), session }), flat(20, { 7: [100, 106, 99, 105] }));
    expect(early.trades.map((t) => t.entryIndex)).toEqual([8]);
    // Signal on the 16:00 candle fills at 17:00, outside it.
    const late = go(def({ longEntry: closeAbove(104), session }), flat(20, { 16: [100, 106, 99, 105] }));
    expect(late.trades).toHaveLength(0);
    expect(late.skipped.outside_session).toBe(1);
  });

  it('labels a trade with the regime of its entry candle', () => {
    const r = go(def({ longEntry: closeAbove(104) }), [FLAT, FLAT, [100, 106, 99, 105], [106, 107, 104, 106], [106, 107, 104, 106]], {
      regimes: ['ranging', 'ranging', 'ranging', 'trending_up', 'trending_up'],
    });
    expect(r.trades[0]).toMatchObject({ signalIndex: 2, entryIndex: 3, regime: 'trending_up' });
  });

  it('does not take a trade whose fill candle already opens beyond the stop or the target', () => {
    // Stop is 10% below the 105 close (94.5); the next candle opens at 90.
    const pastStop = go(def({ longEntry: closeAbove(104) }), [FLAT, FLAT, [100, 106, 99, 105], [90, 91, 89, 90], [90, 91, 89, 90]]);
    expect(pastStop.trades).toHaveLength(0);
    expect(pastStop.skipped.invalid_levels).toBe(1);
    // 1R target is 115.5; the next candle opens at 120.
    const pastTarget = go(def({ longEntry: closeAbove(104), target: { kind: 'r_multiple', r: 1 } }), [FLAT, FLAT, [100, 106, 99, 105], [120, 121, 99, 100], FLAT]);
    expect(pastTarget.trades).toHaveLength(0);
    expect(pastTarget.skipped.invalid_levels).toBe(1);
  });

  it('counts a candle as in the market when a trade opens and closes on it', () => {
    // Fills at 106 on candle 3 and is stopped (94.5) on that same candle.
    const r = go(def({ longEntry: closeAbove(104) }), [FLAT, FLAT, [100, 106, 99, 105], [106, 107, 90, 95], [95, 96, 94, 95]]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]).toMatchObject({ entryIndex: 3, exitIndex: 3 });
    expect(r.metrics.exposure).toBeGreaterThan(0);
  });

  it('leaves trades that cross a split boundary out of every part, and says how many', () => {
    const rows: number[][] = [];
    for (let i = 0; i < 20; i += 1) {
      const c = i === 13 ? 105 : i > 13 ? 105 + (i - 13) * 3 : 100;
      const o = i > 13 ? c - 3 : c;
      rows.push([o, Math.max(o, c) + 0.5, Math.min(o, c) - 0.5, c]);
    }
    const d = def({ longEntry: { join: 'all', conditions: [{ left: op('close'), op: 'crosses_above', right: num(104) }] }, longExit: closeAbove(120) });
    const r = go(d, rows, { split: { kind: 'holdout', inSamplePercent: 70 } });
    expect(r.trades).toHaveLength(1);
    expect(r.splitExcluded).toBe(1);
    expect(r.split.map((p) => p.trades)).toEqual([0, 0]);
    expect(r.warnings.some((w) => /crossed a split boundary/.test(w))).toBe(true);
    const blocks = go(d, rows, { split: { kind: 'walk_forward', folds: 3 } });
    expect(blocks.split.reduce((a, p) => a + p.trades, 0) + blocks.splitExcluded).toBe(blocks.metrics.trades);
    expect(blocks.warnings.some((w) => /^Small samples in block 1 of 3 \(\d+\), block 2 of 3/.test(w))).toBe(true);
  });

  it('warns once out-of-sample results have been shown for other versions', () => {
    const rows = flat(40, { 10: [100, 106, 99, 105] });
    const fresh = go(def({ longEntry: closeAbove(104) }), rows, { split: { kind: 'holdout', inSamplePercent: 70 } });
    expect(fresh.warnings.some((w) => /untouched test/.test(w))).toBe(false);
    const seen = go(def({ longEntry: closeAbove(104) }), rows, { split: { kind: 'holdout', inSamplePercent: 70 }, context: { versionsTried: 2, otherVersionsWithOutOfSample: 1 } });
    expect(seen.warnings.some((w) => /1 other version .* no longer an untouched test/.test(w))).toBe(true);
  });

  it('identifies runs with SHA-256 and writes costs the same way however they were typed', () => {
    const setup = { definition: def({}), dataset: dataset(candles(flat(5))), capital: dec(10000), split: { kind: 'none' } as SplitRule };
    const a = inputHash({ ...setup, costs: { ...ZERO, spread: '0.00010', commissionPerSide: '3.50' } });
    const b = inputHash({ ...setup, costs: { ...ZERO, spread: '1e-4', commissionPerSide: '3.5' } });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(normaliseCosts({ ...ZERO, spread: '0.00010' }).spread).toBe('0.0001');
    const r = go(def({ longEntry: closeAbove(104) }), flat(10, { 3: [100, 106, 99, 105] }));
    expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(r.resultSchemaVersion).toBe(1);
  });

  it('lists the fill rules it follows', () => {
    const text = BACKTEST_CONVENTIONS.join('\n');
    expect(text).toMatch(/For entries at the open, stop and target are both checked on that candle, stop first\./);
    expect(text).toMatch(/only when price trades beyond it/);
    expect(text).toMatch(/never better/);
    expect(text).not.toMatch(/only the stop is checked/);
  });

  it('averages volume over a window that is unknown only while it holds a gap', () => {
    expect(windowAverage([10, 20, null, 10, 30, 50], 2)).toEqual([null, 15, null, null, 20, 40]);
  });

  it('rejects candles with unreadable times or spacing that does not fit the timeframe', () => {
    const cs = candles(flat(4));
    expect(checkCandles([cs[0]!, { ...cs[1]!, time: 'yesterday' as Candle['time'] }, cs[2]!], 'H1').errors.some((e) => /not a valid timestamp/.test(e))).toBe(true);
    const odd = [cs[0]!, { ...cs[1]!, time: new Date(T0 + 90 * 60_000).toISOString() as Candle['time'] }];
    expect(checkCandles(odd, 'H1').errors.some((e) => /spacing/.test(e))).toBe(true);
    expect(checkCandles(cs, 'H1').errors).toEqual([]);
  });

  it('says the template stops sit below the signal candle’s close', () => {
    for (const id of ['breakout-volume-confirmation', 'range-trading']) {
      expect(templateFor(id)?.simplifications.join(' ')).toMatch(/below the signal candle’s close/);
    }
  });
});

describe('comparison review fixes', () => {
  const run: ComparableRun = {
    definition: TREND,
    dataset: { instrumentId: 'sim-eurusd', timeframe: 'H1', seed: 1, candles: 2000 },
    capital: '10000',
    costs: { spread: '0.0001', slippage: '0', commissionPerSide: '3.5', swapLong: '0', swapShort: '0' },
    split: { kind: 'holdout', inSamplePercent: 70 },
    engineVersion: 2,
  };
  it('treats costs and capital written differently as the same', () => {
    const issues = comparisonIssues([run, { ...run, capital: '10000.00', costs: { ...run.costs, spread: '0.00010', commissionPerSide: '3.50' } }]);
    expect(issues.map((i) => i.message).join(' ')).not.toMatch(/different costs|capital/i);
  });
  it('warns when runs come from different engine versions', () => {
    expect(comparisonIssues([run, { ...run, engineVersion: 1 }]).some((i) => /versions of the backtest engine/.test(i.message))).toBe(true);
  });
});
