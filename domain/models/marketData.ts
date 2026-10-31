import type { MarketKind } from '../../shared/types';
import type { UtcIso } from '../../shared/time';
import type { DataQualityReport } from '../marketData/csvImport';
import type { Candle, Timeframe } from './markets';

/**
 * Real price data the learner brought in (spec §30): their own CSV file, or
 * candles fetched from an optional provider with their own key. Stored
 * datasets are never edited; a new import or a refetch is a new dataset.
 */
export type StoredDatasetOrigin = 'user_import' | 'historical';

export interface DatasetSummary {
  readonly id: string;
  readonly origin: StoredDatasetOrigin;
  /** "Your file" for imports, the provider's name otherwise. */
  readonly sourceName: string;
  readonly fileName: string | null;
  readonly symbol: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly venue: string | null;
  /** ISO 4217 quote currency, or null when the source did not give a three-letter code. */
  readonly currency: string | null;
  /**
   * Where the times came from, as recorded: for an import, the UTC offset the learner said the
   * file's zone-less times use (e.g. "UTC+02:00"), which was applied when reading them; for provider
   * data, the exchange's zone as the provider reported it. Candle times are always stored in UTC.
   */
  readonly timeZone: string;
  readonly timeframe: Timeframe;
  /** Practice market whose (teaching-example) contract terms, costs and sizing are used in backtests and replay. */
  readonly contractInstrumentId: string;
  readonly candleCount: number;
  readonly first: UtcIso;
  readonly last: UtcIso;
  readonly quality: DataQualityReport;
  /** SHA-256 of the candles, so a backtest can tell if the data it used has changed. */
  readonly contentHash: string;
  readonly createdAt: UtcIso;
}

export interface StoredDataset extends DatasetSummary {
  readonly candles: readonly Candle[];
}

/** The label shown wherever this data is used (spec §30: never mix sources silently). */
export function storedDatasetLabel(d: Pick<DatasetSummary, 'origin' | 'sourceName' | 'fileName' | 'symbol'>): string {
  return d.origin === 'user_import' ? `Imported: ${d.fileName ?? 'your file'}` : `Historical · ${d.sourceName} · ${d.symbol}`;
}

/** Practice market used for contract terms when real data of each market is used. */
export const CONTRACT_INSTRUMENT_FOR_MARKET: Readonly<Record<MarketKind, string>> = {
  forex: 'sim-eurusd',
  stocks: 'sim-stock',
  penny_stocks: 'sim-penny',
  commodities: 'sim-gold',
  futures: 'sim-index-future',
};
