import { dataQualityError, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { checkCandles, type Dataset, type DatasetSpec } from '../backtest/dataset';
import { storedDatasetLabel, type StoredDataset } from '../models/marketData';
import { estimateRegimes } from './regimes';

/** Turns stored real data into the `Dataset` the backtest engine reads, checking it again on load (spec §30). */
export function realDataset(spec: DatasetSpec, stored: StoredDataset): Result<Dataset, AppError> {
  if (spec.datasetId !== stored.id) return err(validationError('That data set does not match the run'));
  if (spec.timeframe !== stored.timeframe) return err(validationError(`This data is ${stored.timeframe}; the run asks for ${spec.timeframe}`));
  if (spec.instrumentId !== stored.contractInstrumentId) return err(validationError('The run uses a different market from this data set'));
  if (spec.contentHash && spec.contentHash !== stored.contentHash) return err(dataQualityError('This data set is not the one the run used'));
  const check = checkCandles(stored.candles, stored.timeframe);
  if (check.errors.length > 0) return err(dataQualityError('The stored data failed its checks', { issues: check.errors }));
  const label = storedDatasetLabel(stored);
  const where = stored.origin === 'user_import' ? `from your file ${stored.fileName ?? ''}`.trim() : `from ${stored.sourceName}`;
  return ok({
    spec: { ...spec, candles: stored.candles.length, contentHash: stored.contentHash, dataLabel: storedDatasetLabel(stored) },
    origin: stored.origin,
    label,
    description: `${stored.candles.length.toLocaleString('en-US')} ${stored.timeframe} candles of ${stored.symbol} ${where}, ${stored.first.slice(0, 10)} to ${stored.last.slice(0, 10)}. Real past prices, used as they are (no adjustment for splits, dividends or rollovers). Market conditions in the breakdown are estimated with hindsight.`,
    candles: stored.candles,
    regimes: estimateRegimes(stored.candles),
  });
}
