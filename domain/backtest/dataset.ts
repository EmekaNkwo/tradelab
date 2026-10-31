import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import { createRng } from '../market/random';
import { candleIssues, generateScenario, SCENARIO_KINDS, TIMEFRAME_MINUTES, type ScenarioKind } from '../market/scenarios';
import type { Candle, DataOrigin, Timeframe } from '../models/markets';
import { PRACTICE_INSTRUMENTS } from '../simulation/instruments';
import { drainSteps, type Steps } from './stepwise';

/**
 * Candle data for backtests (spec §16.3, §30). Today the only source is the
 * app's own scenario generator: a seeded chain of scenario segments (trends,
 * ranges, breakouts, shocks), so every run is reproducible and every result
 * is labelled "Simulated data". There is no bundled historical dataset.
 * Real data the learner imports or fetches (Phase 11) comes through
 * `domain/marketData/dataset.ts` with the same `Dataset` shape and its own
 * origin and label.
 */

export type Regime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
export const REGIMES: readonly Regime[] = ['trending_up', 'trending_down', 'ranging', 'volatile'];

export const SIMULATED_DATA_LABEL = 'Simulated data';

export interface DatasetSpec {
  readonly instrumentId: string;
  readonly timeframe: Timeframe;
  readonly seed: number;
  readonly candles: number;
  /** Set for real data (an import or provider data set, spec §30); `seed` is then unused and `candles` is the stored count. */
  readonly datasetId?: string;
  /** Real data only: the SHA-256 of the candles used, so equal data is recognised and changed data is caught. */
  readonly contentHash?: string;
  /** Real data only: the label of the data used, kept so a run can say what it used after the data is gone. */
  readonly dataLabel?: string;
}

export const DATASET_LIMITS = { candles: { min: 500, max: 30000 } } as const;

export interface DataCheck {
  /** Problems that make the data unusable; a run is refused. */
  readonly errors: readonly string[];
  /** Problems that are disclosed with the results. */
  readonly warnings: readonly string[];
}

export interface Dataset {
  readonly spec: DatasetSpec;
  readonly origin: DataOrigin;
  readonly label: string;
  readonly description: string;
  readonly candles: readonly Candle[];
  /** Regime of each candle, from the scenario segment it belongs to. */
  readonly regimes: readonly Regime[];
}

const START_TIME = '2020-01-06T00:00:00.000Z';

const UP_KINDS: readonly ScenarioKind[] = ['strong_uptrend', 'pullback', 'recovery', 'range', 'breakout'];
const DOWN_KINDS: readonly ScenarioKind[] = ['downtrend', 'reversal', 'crash', 'range', 'false_breakout'];

function regimeOf(kind: ScenarioKind, trend: 'up' | 'down' | 'sideways'): Regime {
  if (kind === 'high_volatility' || kind === 'news_shock') return 'volatile';
  if (trend === 'up') return 'trending_up';
  if (trend === 'down') return 'trending_down';
  return 'ranging';
}

/** Missing candles (gaps longer than one timeframe step) and broken candles. Duplicate or backwards times are errors. */
export function checkCandles(candles: readonly Candle[], timeframe: Timeframe): DataCheck {
  return drainSteps(checkCandlesStepwise(candles, timeframe, candles.length));
}

/** `checkCandles` in steps of `chunk` candles, for the sliced runner (ADR 0006). Same result, same order. */
export function* checkCandlesStepwise(candles: readonly Candle[], timeframe: Timeframe, chunk: number): Steps<DataCheck> {
  const size = Math.max(1, Math.floor(chunk));
  const issues: string[] = [];
  const spacing: string[] = [];
  const step = TIMEFRAME_MINUTES[timeframe] * 60_000;
  let gaps = 0;
  for (let from = 0; from < candles.length; from += size) {
    if (from > 0) yield;
    const to = Math.min(candles.length, from + size);
    // A loop, not push(...): a large broken file can have more issues than a call can take as arguments.
    for (const issue of candleIssues(candles, from, to)) issues.push(issue);
    for (let i = Math.max(1, from); i < to; i += 1) {
      const diff = Date.parse((candles[i] as Candle).time) - Date.parse((candles[i - 1] as Candle).time);
      if (Number.isNaN(diff) || diff <= 0) continue;
      // Spacing that is not a whole number of candles means the data is not on this timeframe.
      if (diff % step !== 0) spacing.push(`candle ${i}: spacing does not match the ${timeframe} timeframe`);
      else if (diff > step) gaps += 1;
    }
  }
  const warnings = gaps > 0 ? [`${gaps} gap${gaps === 1 ? '' : 's'} where candles are missing; trades across a gap may fill at very different prices`] : [];
  return { errors: [...issues, ...spacing].slice(0, 20), warnings };
}

/**
 * A seeded chain of scenario segments. Segment kinds lean back towards the
 * starting price when it has drifted far, so long runs stay in a plausible
 * band rather than compounding without limit.
 */
export function simulatedDataset(spec: DatasetSpec): Result<Dataset, AppError> {
  return drainSteps(simulatedDatasetStepwise(spec, spec.candles));
}

/** `simulatedDataset` in steps of about `chunk` candles, for the sliced runner (ADR 0006). Same seed, same data. */
export function* simulatedDatasetStepwise(spec: DatasetSpec, chunk: number): Steps<Result<Dataset, AppError>> {
  const instrument = PRACTICE_INSTRUMENTS.find((i) => i.id === spec.instrumentId);
  if (!instrument) return err(validationError('Choose a practice market'));
  const { min, max } = DATASET_LIMITS.candles;
  if (!Number.isInteger(spec.candles) || spec.candles < min || spec.candles > max) {
    return err(validationError(`Use between ${min} and ${max} candles`));
  }
  if (!Number.isInteger(spec.seed) || spec.seed < 0) return err(validationError('The data seed must be a whole number of 0 or more'));
  const rng = createRng(spec.seed + 104729);
  const stepMs = TIMEFRAME_MINUTES[spec.timeframe] * 60_000;
  const candles: Candle[] = [];
  const regimes: Regime[] = [];
  const size = Math.max(1, Math.floor(chunk));
  let price = instrument.startPrice;
  let sinceYield = 0;
  while (candles.length < spec.candles) {
    if (sinceYield >= size) {
      sinceYield = 0;
      yield;
    }
    const ratio = price / instrument.startPrice;
    const pool = ratio > 1.6 ? DOWN_KINDS : ratio < 1 / 1.6 ? UP_KINDS : SCENARIO_KINDS;
    const kind = pool[rng.int(0, pool.length - 1)] as ScenarioKind;
    const length = Math.min(rng.int(150, 350), spec.candles - candles.length);
    const startMs = Date.parse(START_TIME) + candles.length * stepMs;
    const scenario = generateScenario({
      kind,
      seed: rng.int(0, 2_000_000_000),
      count: Math.max(length, 2),
      timeframe: spec.timeframe,
      startPrice: price,
      startTime: new Date(startMs).toISOString() as UtcIso,
      precision: instrument.precision,
    });
    const part = scenario.candles.slice(0, length);
    for (const c of part) candles.push(c);
    const regime = regimeOf(kind, scenario.truth.overallTrend);
    for (let i = 0; i < part.length; i += 1) regimes.push(regime);
    price = (part[part.length - 1] as Candle).close.toNumber();
    sinceYield += part.length;
  }
  return ok({
    spec,
    origin: 'simulated',
    label: SIMULATED_DATA_LABEL,
    description: `${spec.candles.toLocaleString('en-US')} simulated ${spec.timeframe} candles for ${instrument.symbol}, seed ${spec.seed}. Made by the app's scenario generator; not real market history.`,
    candles,
    regimes,
  });
}
