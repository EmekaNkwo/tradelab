import { checkRawRows } from '../../domain/marketData/csvImport';
import { CONTRACT_INSTRUMENT_FOR_MARKET, type DatasetSummary } from '../../domain/models/marketData';
import type { Timeframe } from '../../domain/models/markets';
import { cancelled, shownError, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { MarketKind } from '../../shared/types';
import { toUtcIso, type Clock } from '../../shared/time';
import type { MarketDataRepository } from '../repositories/marketDataRepository';
import type { SettingsRepository } from '../repositories/settingsRepository';
import type { SecretStore } from '../secure/types';
import type { MarketDataProvider } from './provider';

/**
 * Fetching provider data (spec §30): cache first, then the provider's rate
 * limits, then the learner's key from secure storage, then the same strict
 * checks as a CSV import. Failures never leave half-saved data; cached data
 * keeps working offline.
 */

/** Provider data younger than this is reused instead of spending another request. */
export const PROVIDER_CACHE_HOURS = 12;

export interface ProviderFetchRequest {
  readonly symbol: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly timeframe: Timeframe;
  readonly candles: number;
  readonly signal?: AbortSignal;
  /** Skip the cache and ask the provider again. */
  readonly refresh?: boolean;
}

export interface ProviderFetchOutcome {
  readonly dataset: DatasetSummary;
  readonly fromCache: boolean;
  /** When these candles were fetched (the cached copy's time on a cache hit). */
  readonly fetchedAt: string;
}

export interface ProviderDataService {
  readonly providerName: string;
  readonly maxCandles: number;
  readonly timeframes: readonly Timeframe[];
  getSeries(req: ProviderFetchRequest): Promise<Result<ProviderFetchOutcome, AppError>>;
}

/** Rolling-window request counter, so the app never sends more than the plan allows. */
export function createRateLimiter(perMinute: number, perDay: number, now: () => number) {
  let sent: readonly number[] = [];
  return {
    /** Null when a request may go now, otherwise a learner-facing reason. */
    check(): string | null {
      const t = now();
      sent = sent.filter((s) => t - s < 86_400_000);
      if (sent.filter((s) => t - s < 60_000).length >= perMinute) return `The free plan allows ${perMinute} requests a minute. Wait a minute and try again.`;
      if (sent.length >= perDay) return `The free plan allows ${perDay} requests a day. Try again tomorrow.`;
      return null;
    },
    record(): void {
      sent = [...sent, now()];
    },
  };
}

/** Everything that changes what the data means: the market decides the contract terms and costs used with it. */
export const requestKey = (providerId: string, req: Pick<ProviderFetchRequest, 'symbol' | 'timeframe' | 'candles' | 'market'>) => `${providerId}|${req.symbol.trim().toUpperCase()}|${req.timeframe}|${req.candles}|${req.market}`;

/** Daily and weekly candles from a provider carry the exchange's own date, not a UTC day. */
export const LOCAL_DATE_NOTE = 'Daily and weekly candles are dated by the exchange’s local trading day, not by UTC midnight.';

export function createProviderDataService(deps: {
  readonly provider: MarketDataProvider;
  readonly secrets: SecretStore;
  readonly marketData: MarketDataRepository;
  readonly clock: Clock;
  readonly settings: Pick<SettingsRepository, 'get'>;
}): ProviderDataService {
  const { provider, secrets, marketData, clock, settings } = deps;
  const limiter = createRateLimiter(provider.requestsPerMinute, provider.requestsPerDay, () => clock.now().getTime());
  return {
    providerName: provider.name,
    maxCandles: provider.maxCandles,
    timeframes: provider.timeframes,
    async getSeries(req) {
      // The service checks the switch itself, so no caller can reach the network while it is off.
      const current = await settings.get();
      if (!current.ok) return current;
      if (!current.value.integrations.marketProvider) return err(validationError(`${provider.name} is turned off. Turn it on in Settings → Data and AI services.`));
      if (!provider.timeframes.includes(req.timeframe)) return err(validationError(`${provider.name} does not offer that timeframe`));
      const key = requestKey(provider.id, req);
      if (!req.refresh) {
        const cached = await marketData.findProviderData(key);
        if (!cached.ok) return cached;
        const ageMs = clock.now().getTime() - Date.parse(cached.value?.fetchedAt ?? '');
        if (cached.value && ageMs >= 0 && ageMs < PROVIDER_CACHE_HOURS * 3_600_000) return ok({ dataset: cached.value.summary, fromCache: true, fetchedAt: cached.value.fetchedAt });
      }
      const limited = limiter.check();
      if (limited) return err(shownError('ProviderUnavailable', limited));
      const apiKey = await secrets.get('twelvedata_api_key');
      if (!apiKey.ok) return apiKey;
      if (!apiKey.value) return err(validationError(`Add your ${provider.name} API key in Settings → Data and AI services first`));
      limiter.record();
      const series = await provider.fetchSeries({ symbol: req.symbol, timeframe: req.timeframe, candles: req.candles, apiKey: apiKey.value, signal: req.signal });
      if (!series.ok) return series;
      const checked = checkRawRows(
        series.value.rows.map((r, i) => ({ line: i + 1, time: r.datetime, open: r.open, high: r.high, low: r.low, close: r.close, ...(r.volume === undefined ? {} : { volume: r.volume }) })),
        { unit: 'row', volumeColumn: series.value.rows.some((r) => r.volume !== undefined), naiveIsUtc: true, nowMs: clock.now().getTime() },
      );
      if (checked.report.status === 'refused') return err(shownError('DataQualityError', `${provider.name}'s data failed the app's checks, so it was not saved: ${checked.report.errors[0] ?? 'unknown problem'}`, { issues: checked.report.errors }));
      if (checked.report.timeframe !== req.timeframe) return err(shownError('DataQualityError', `${provider.name} returned ${checked.report.timeframe ?? 'unevenly spaced'} candles, not ${req.timeframe}, so the data was not saved.`));
      if (req.signal?.aborted) return err(cancelled('The fetch was cancelled'));
      const saved = await marketData.saveProviderData(
        key,
        {
          origin: 'historical',
          sourceName: provider.name,
          fileName: null,
          symbol: series.value.symbol.slice(0, 40),
          name: req.name.trim() || series.value.symbol,
          market: req.market,
          venue: series.value.exchange?.slice(0, 80) ?? null,
          currency: /^[A-Z]{3}$/.test(series.value.currency ?? '') ? series.value.currency : null,
          timeZone: series.value.exchangeTimeZone?.slice(0, 64) ?? 'UTC',
          timeframe: req.timeframe,
          contractInstrumentId: CONTRACT_INSTRUMENT_FOR_MARKET[req.market],
          candles: checked.candles,
          quality: req.timeframe === 'D1' || req.timeframe === 'W1' ? { ...checked.report, status: 'warnings', warnings: [LOCAL_DATE_NOTE, ...checked.report.warnings] } : checked.report,
        },
        toUtcIso(clock.now()),
      );
      if (!saved.ok) return saved;
      return ok({ dataset: saved.value, fromCache: false, fetchedAt: saved.value.createdAt });
    },
  };
}
