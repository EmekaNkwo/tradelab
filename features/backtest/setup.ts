import { dec, isTypedNumber } from '../../shared/decimal';
import {
  costIssues,
  DATASET_LIMITS,
  defaultCosts,
  type BacktestSetup,
  type RunContext,
  type Dataset,
  type SplitRule,
  type StrategyDefinition,
} from '../../domain/backtest';
import { practiceInstrument } from '../../domain/simulation/instruments';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { RunInputs } from '../../data';

/** The run form: data, capital, costs and split (spec §16.3). Text fields stay strings until checked. */

export interface RunForm {
  /** Real data (an import or provider data set) instead of simulated candles; null for simulated. */
  readonly datasetId: string | null;
  readonly seed: string;
  readonly candles: string;
  readonly capital: string;
  readonly spread: string;
  readonly slippage: string;
  readonly commissionPerSide: string;
  readonly swapLong: string;
  readonly swapShort: string;
  readonly split: SplitRule;
  /** Real data only: the learner has checked the spread and slippage for this market (the practice defaults may not fit). */
  readonly costsConfirmed: boolean;
}

/** The real data set chosen on the run screen, as resolved from what is stored now (never from the form alone). */
export interface ChosenData {
  readonly id: string;
  readonly candleCount: number;
  readonly contentHash: string;
  readonly label: string;
}

export const CANDLE_CHOICES: readonly number[] = [1000, 3000, 10000, 26000];
export const CAPITAL_LIMITS = { min: 100, max: 10_000_000 } as const;

export function defaultRunForm(d: StrategyDefinition, seed = 1): RunForm {
  const instrument = practiceInstrument(d.instrumentId);
  const costs = instrument ? defaultCosts(instrument) : { spread: '0', slippage: '0', commissionPerSide: '0', swapLong: '0', swapShort: '0' };
  return { datasetId: null, seed: String(seed), candles: '3000', capital: '10000', ...costs, split: { kind: 'holdout', inSamplePercent: 70 }, costsConfirmed: false };
}

export const formFromInputs = (i: RunInputs): RunForm => ({ datasetId: i.dataset.datasetId ?? null, seed: String(i.dataset.seed), candles: String(i.dataset.candles), capital: i.capital, ...i.costs, split: i.split, costsConfirmed: i.dataset.datasetId !== undefined });

export interface FormIssue {
  readonly field: keyof RunForm;
  readonly message: string;
}

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

/**
 * Checks the form and returns the run inputs for this definition. Real data
 * comes from `chosen`, the data set resolved from storage: the form's
 * `datasetId` is only the picker's selection and is never trusted on its own.
 */
export function runInputs(d: StrategyDefinition, form: RunForm, context: RunContext, chosen: ChosenData | null = null): Result<RunInputs, readonly FormIssue[]> {
  const issues: FormIssue[] = [];
  if (form.datasetId !== null && chosen?.id !== form.datasetId) issues.push({ field: 'datasetId', message: 'The chosen data is no longer on this device. Choose again.' });
  // Real data has no seed, and its length is the stored data set's.
  const seed = chosen ? 0 : whole(form.seed);
  if (!Number.isSafeInteger(seed)) issues.push({ field: 'seed', message: 'The seed must be a whole number' });
  const candles = chosen ? chosen.candleCount : whole(form.candles);
  if (!chosen && (!Number.isInteger(candles) || candles < DATASET_LIMITS.candles.min || candles > DATASET_LIMITS.candles.max)) {
    issues.push({ field: 'candles', message: `Use ${DATASET_LIMITS.candles.min} to ${DATASET_LIMITS.candles.max} candles` });
  }
  if (chosen && !form.costsConfirmed) issues.push({ field: 'costsConfirmed', message: 'Check the spread and slippage for this market, then confirm them' });
  const capital = form.capital.trim();
  if (!isTypedNumber(capital) || dec(capital).lt(CAPITAL_LIMITS.min) || dec(capital).gt(CAPITAL_LIMITS.max)) {
    issues.push({ field: 'capital', message: `Starting capital must be from ${CAPITAL_LIMITS.min} to ${CAPITAL_LIMITS.max.toLocaleString('en-US')} USD` });
  }
  const costs = { spread: form.spread.trim(), slippage: form.slippage.trim(), commissionPerSide: form.commissionPerSide.trim(), swapLong: form.swapLong.trim(), swapShort: form.swapShort.trim() };
  for (const c of costIssues(costs)) issues.push({ field: c.field, message: c.message });
  if (issues.length > 0) return err(issues);
  const dataset = { instrumentId: d.instrumentId, timeframe: d.timeframe, seed, candles, ...(chosen ? { datasetId: chosen.id, contentHash: chosen.contentHash, dataLabel: chosen.label } : {}) };
  return ok({ dataset, capital, costs, split: form.split, versionsTried: Math.max(1, context.versionsTried), otherVersionsWithOutOfSample: Math.max(0, context.otherVersionsWithOutOfSample) });
}

/** The engine setup for a definition, its inputs and the loaded dataset. */
export function backtestSetup(d: StrategyDefinition, inputs: RunInputs, dataset: Dataset): Result<BacktestSetup, AppError> {
  if (dataset.spec.instrumentId !== d.instrumentId || dataset.spec.timeframe !== d.timeframe) return err(validationError('The data does not match the strategy’s market and timeframe'));
  return ok({ definition: d, dataset, capital: dec(inputs.capital), costs: inputs.costs, split: inputs.split });
}

/** Versions saved, and other versions whose out-of-sample results the learner has already seen (spec §16.3 overfitting warnings). */
export function runContext(version: number, versionsSaved: number, runs: readonly { readonly version: number; readonly inputs: { readonly split: SplitRule } }[]): RunContext {
  const seen = new Set(runs.filter((r) => r.version !== version && r.inputs.split.kind !== 'none').map((r) => r.version));
  return { versionsTried: versionsSaved, otherVersionsWithOutOfSample: seen.size };
}
