import { dec } from '../../../shared/decimal';
import type { Candle } from '../../models/markets';
import { practiceInstrument } from '../../simulation/instruments';
import {
  BACKTEST_TEMPLATES,
  checkCandles,
  checkCandlesStepwise,
  createBacktest,
  createBacktestStepwise,
  defaultCosts,
  drainSteps,
  prepareSeries,
  prepareSeriesStepwise,
  runBacktest,
  simulatedDataset,
  simulatedDatasetStepwise,
  type BacktestSetup,
  type DatasetSpec,
} from '..';

/**
 * Set-up before the first backtest slice (ADR 0006): data generation, data
 * checks and indicator precomputation run as resumable steps, so the runner
 * can yield between them. Running the steps must give exactly what the
 * one-call versions give.
 */

const TREND = BACKTEST_TEMPLATES.find((t) => t.strategyId === 'trend-following-moving-averages')!.definition;
const H1 = { ...TREND, timeframe: 'H1' as const };
const spec = (candles: number, seed = 7): DatasetSpec => ({ instrumentId: H1.instrumentId, timeframe: 'H1', seed, candles });

function countSteps<T>(steps: Generator<unknown, T, void>): { readonly value: T; readonly yields: number } {
  let yields = 0;
  let next = steps.next();
  while (!next.done) {
    yields += 1;
    next = steps.next();
  }
  return { value: next.value, yields };
}

function setupFrom(candles: number): BacktestSetup {
  const ds = simulatedDataset(spec(candles));
  if (!ds.ok) throw new Error(ds.error.message);
  return { definition: H1, dataset: ds.value, capital: dec(10000), costs: defaultCosts(practiceInstrument(H1.instrumentId)!), split: { kind: 'none' } };
}

describe('simulated data in steps', () => {
  it('gives exactly the same candles and regimes as one call, and yields about once per chunk', () => {
    const once = simulatedDataset(spec(5000));
    const stepped = countSteps(simulatedDatasetStepwise(spec(5000), 1000));
    expect(once.ok && stepped.value.ok).toBe(true);
    if (!once.ok || !stepped.value.ok) return;
    expect(stepped.value.value).toEqual(once.value);
    expect(stepped.yields).toBeGreaterThanOrEqual(4);
    expect(stepped.yields).toBeLessThanOrEqual(6);
  });

  it('refuses a bad spec before doing any work', () => {
    const bad = countSteps(simulatedDatasetStepwise(spec(10), 1000));
    expect(bad.value.ok).toBe(false);
    expect(bad.yields).toBe(0);
  });
});

describe('data checks in steps', () => {
  it('reports the same errors, in the same order, as one call', () => {
    const ds = simulatedDataset(spec(3000));
    if (!ds.ok) throw new Error(ds.error.message);
    const broken: Candle[] = ds.value.candles.map((c, i) => (i === 2500 ? { ...c, high: c.low.minus(1) } : i === 1200 ? { ...c, time: (ds.value.candles[1199] as Candle).time } : c));
    const once = checkCandles(broken, 'H1');
    const stepped = countSteps(checkCandlesStepwise(broken, 'H1', 500));
    expect(once.errors.length).toBeGreaterThan(0);
    expect(stepped.value).toEqual(once);
    expect(stepped.yields).toBeGreaterThanOrEqual(5);
  });
});

describe('indicator set-up in steps', () => {
  it('computes the same series as one call', () => {
    const ds = simulatedDataset(spec(4000));
    if (!ds.ok) throw new Error(ds.error.message);
    const once = prepareSeries(H1, ds.value.candles);
    const stepped = countSteps(prepareSeriesStepwise(H1, ds.value.candles, 1000));
    expect(stepped.value).toEqual(once);
    expect(stepped.yields).toBeGreaterThanOrEqual(4);
  });
});

describe('backtest set-up in steps', () => {
  it('drained, it is the same as createBacktest and gives the same fingerprint', () => {
    const setup = setupFrom(6000);
    const once = createBacktest(setup);
    const stepped = countSteps(createBacktestStepwise(setup, 1000));
    expect(once.ok && stepped.value.ok).toBe(true);
    if (!once.ok || !stepped.value.ok) return;
    expect(stepped.value.value.series).toEqual(once.value.series);
    expect(stepped.value.value.dataCheck).toEqual(once.value.dataCheck);
    expect(stepped.yields).toBeGreaterThanOrEqual(6);
    // The runner's result from the stepped state matches the one-call run.
    const run = runBacktest(setup);
    expect(run.ok).toBe(true);
  });

  it('refuses an invalid setup without yielding', () => {
    const bad = countSteps(createBacktestStepwise({ ...setupFrom(600), capital: dec(-1) }, 100));
    expect(bad.value.ok).toBe(false);
    expect(bad.yields).toBe(0);
  });

  it('drainSteps returns the final value', () => {
    function* three(): Generator<void, number, void> {
      yield;
      yield;
      return 3;
    }
    expect(drainSteps(three())).toBe(3);
  });
});

describe('checkCandles on very large broken data', () => {
  it('collects issues without spreading them into one call (no stack overflow), keeping the first 20', () => {
    const same: Candle = { time: '2026-01-01T00:00:00.000Z' as never, open: dec('1'), high: dec('1'), low: dec('1'), close: dec('1'), volume: null } as Candle;
    const candles: readonly Candle[] = Array.from({ length: 400_000 }, () => same);
    const check = checkCandles(candles, 'H1');
    expect(check.errors).toHaveLength(20);
    expect(check.errors[0]).toBe('candle 1: time is not after the previous candle');
  });
});
