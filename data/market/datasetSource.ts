import { simulatedDatasetStepwise, type Dataset, type DatasetSpec } from '../../domain/backtest';
import { realDataset } from '../../domain/marketData/dataset';
import { notFound, validationError, type AppError } from '../../shared/errors';
import { err, type Result } from '../../shared/result';
import type { MarketDataRepository } from '../repositories/marketDataRepository';

export interface LoadOptions {
  /** Called between generation steps so the screen keeps responding (ADR 0006). Without it, data is made in one call. */
  readonly pause?: () => Promise<void>;
  /** Checked at each pause; a cancelled load returns an error the caller ignores. */
  readonly isCancelled?: () => boolean;
}

/**
 * Where backtest candles come from (spec §16.3, §30). A spec without a
 * `datasetId` is the seeded simulated source; with one, the candles are the
 * learner's imported or fetched data, checked again on load and labelled
 * with their source. The two are never mixed in one run.
 */
export interface DatasetSource {
  /** Shown next to every simulated result, e.g. "Simulated data"; real data carries its own label in `Dataset.label`. */
  readonly label: string;
  load(spec: DatasetSpec, options?: LoadOptions): Promise<Result<Dataset, AppError>>;
}

/** Candles generated between pauses. */
export const SIMULATED_CANDLES_PER_STEP = 250;

/** Runs the seeded generator, pausing between steps; same seed, same data, with or without pauses. */
async function simulated(spec: DatasetSpec, options: LoadOptions = {}): Promise<Result<Dataset, AppError>> {
  const steps = simulatedDatasetStepwise(spec, options.pause ? SIMULATED_CANDLES_PER_STEP : spec.candles);
  let next = steps.next();
  while (!next.done) {
    if (options.pause) await options.pause();
    if (options.isCancelled?.()) return err(validationError('The data load was cancelled'));
    next = steps.next();
  }
  return next.value;
}

export function createSimulatedDatasetSource(): DatasetSource {
  return {
    label: 'Simulated data',
    load: async (spec, options) => (spec.datasetId ? err(notFound('Real data is not available here')) : simulated(spec, options)),
  };
}

/** A run's real data set is gone: deleted, or never restored (provider data is not in backups). */
export function missingDataError(spec: DatasetSpec): AppError {
  const message = `The data this run used is no longer on this device${spec.dataLabel ? ` (was: ${spec.dataLabel})` : ''}, so the run cannot be repeated.`;
  return notFound(message, { learnerText: message });
}

export function createDatasetSource(marketData: MarketDataRepository): DatasetSource {
  return {
    label: 'Simulated data',
    async load(spec, options) {
      if (!spec.datasetId) return simulated(spec, options);
      const stored = await marketData.get(spec.datasetId);
      if (!stored.ok) return stored;
      if (!stored.value) return err(missingDataError(spec));
      return realDataset(spec, stored.value);
    },
  };
}
