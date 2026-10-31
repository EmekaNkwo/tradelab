import type { Timeframe } from '../../domain/models/markets';
import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';

/**
 * An optional historical-data provider (spec §30), used only with the
 * learner's own key. The transport lives in `integrations/http/`; it checks
 * the response shape and returns the rows as text. This layer then runs the
 * same strict checks as a CSV import, caches the result and enforces rate
 * limits (`providerDataService.ts`).
 */
export interface ProviderSeriesRequest {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  /** Number of most recent candles. */
  readonly candles: number;
  readonly apiKey: string;
  readonly signal?: AbortSignal;
}

export interface ProviderRow {
  readonly datetime: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume?: string;
}

export interface ProviderSeries {
  readonly symbol: string;
  readonly currency: string | null;
  readonly exchange: string | null;
  readonly exchangeTimeZone: string | null;
  readonly instrumentType: string | null;
  /** Times in the rows are in this zone (the request asks for UTC). */
  readonly rowsTimeZone: 'UTC';
  readonly rows: readonly ProviderRow[];
}

export interface MarketDataProvider {
  readonly id: string;
  readonly name: string;
  /** Requests per minute allowed on the provider's free plan; the service stays under it. */
  readonly requestsPerMinute: number;
  readonly requestsPerDay: number;
  readonly maxCandles: number;
  readonly timeframes: readonly Timeframe[];
  fetchSeries(req: ProviderSeriesRequest): Promise<Result<ProviderSeries, AppError>>;
}
