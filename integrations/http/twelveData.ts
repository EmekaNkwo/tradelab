import { z } from 'zod';
import type { MarketDataProvider, ProviderSeries } from '../../data/market/provider';
import { shownError, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { createHttpClient, type HttpClient } from './httpClient';

/**
 * Twelve Data `time_series` (historical OHLCV), read from the provider's own
 * documentation (twelvedata.com/docs, "Time series"; pricing page for plan
 * limits) in October 2026:
 * - GET https://api.twelvedata.com/time_series with `symbol`, `interval`,
 *   `outputsize` (1–5000), `timezone`, `order`; the key goes in the
 *   `Authorization: apikey <key>` header, never in the URL.
 * - A success is `{ meta, values: [{ datetime, open, high, low, close, volume? }], status: "ok" }`
 *   with prices as strings; an error is `{ code, message, status: "error" }`
 *   (400, 401, 403, 404, 414, 429, 500), sometimes with HTTP 200.
 * - Basic (free) plan: 8 requests a minute, 800 a day.
 * The data is historical end-of-candle data, so it is labelled "Historical",
 * never live.
 */

const BASE_URL = 'https://api.twelvedata.com/time_series';
const TIMEOUT_MS = 20_000;

const INTERVALS = { M1: '1min', M5: '5min', M15: '15min', M30: '30min', H1: '1h', H4: '4h', D1: '1day', W1: '1week' } as const;

const numberText = z.union([z.string(), z.number()]).transform((v) => String(v));

const successSchema = z.object({
  meta: z
    .object({
      symbol: z.string(),
      currency: z.string().optional(),
      currency_base: z.string().optional(),
      currency_quote: z.string().optional(),
      exchange: z.string().optional(),
      exchange_timezone: z.string().optional(),
      type: z.string().optional(),
    })
    .passthrough(),
  values: z
    .array(z.object({ datetime: z.string().max(40), open: numberText, high: numberText, low: numberText, close: numberText, volume: numberText.optional() }).passthrough())
    .max(5000),
  status: z.literal('ok'),
});

const errorSchema = z.object({ code: z.number().optional(), message: z.string().optional(), status: z.literal('error') });

/** A learner-facing reason for a Twelve Data error code; the provider's own message is logged, not shown. */
export function describeTwelveDataError(code: number | undefined): AppError {
  switch (code) {
    case 400:
      return validationError('Twelve Data did not accept the request. Check the symbol (for example EUR/USD or AAPL) and the timeframe.');
    case 401:
      return validationError('Twelve Data did not accept your API key. Check it in Settings → Data and AI services.');
    case 403:
      return validationError('Your Twelve Data plan does not include this symbol or timeframe.');
    case 404:
      return validationError('Twelve Data has no data for that symbol. Check the spelling and the market.');
    case 429:
      return shownError('ProviderUnavailable', 'Twelve Data’s request limit for your plan has been reached. Wait a minute (or until tomorrow) and try again.');
    default:
      return shownError('ProviderUnavailable', 'Twelve Data is not answering properly right now. Try again later.');
  }
}

export function parseTwelveDataResponse(status: number, json: unknown): Result<ProviderSeries, AppError> {
  const failure = errorSchema.safeParse(json);
  if (failure.success) {
    logger.warn('Twelve Data returned an error', { code: failure.data.code ?? status });
    return err(describeTwelveDataError(failure.data.code ?? status));
  }
  if (status >= 400) return err(describeTwelveDataError(status));
  const parsed = successSchema.safeParse(json);
  if (!parsed.success) return err(shownError('ProviderUnavailable', 'Twelve Data sent data in an unexpected shape. Try again later.'));
  const { meta, values } = parsed.data;
  return ok({
    symbol: meta.symbol,
    currency: meta.currency ?? meta.currency_quote ?? null,
    exchange: meta.exchange ?? null,
    exchangeTimeZone: meta.exchange_timezone ?? null,
    instrumentType: meta.type ?? null,
    rowsTimeZone: 'UTC',
    rows: values.map((v) => ({ datetime: v.datetime, open: v.open, high: v.high, low: v.low, close: v.close, ...(v.volume === undefined ? {} : { volume: v.volume }) })),
  });
}

export function twelveDataUrl(symbol: string, interval: string, outputsize: number): string {
  const params = new URLSearchParams({ symbol, interval, outputsize: String(outputsize), timezone: 'UTC', order: 'asc', format: 'JSON' });
  return `${BASE_URL}?${params.toString()}`;
}

export function createTwelveDataProvider(http: HttpClient = createHttpClient()): MarketDataProvider {
  return {
    id: 'twelvedata',
    name: 'Twelve Data',
    requestsPerMinute: 8,
    requestsPerDay: 800,
    maxCandles: 5000,
    timeframes: Object.keys(INTERVALS) as (keyof typeof INTERVALS)[],
    async fetchSeries(req) {
      const symbol = req.symbol.trim().toUpperCase();
      if (!/^[A-Z0-9./:_-]{1,30}$/.test(symbol)) return err(validationError('Use a symbol such as EUR/USD, XAU/USD or AAPL'));
      if (!Number.isInteger(req.candles) || req.candles < 1 || req.candles > 5000) return err(validationError('Ask for 1 to 5,000 candles'));
      const interval = INTERVALS[req.timeframe];
      // No automatic retry: every request counts against the learner's plan limit, so they choose when to try again.
      const res = await http.request({ url: twelveDataUrl(symbol, interval, req.candles), headers: { Authorization: `apikey ${req.apiKey}`, Accept: 'application/json' }, timeoutMs: TIMEOUT_MS, signal: req.signal, retries: 0 });
      if (!res.ok) return res;
      return parseTwelveDataResponse(res.value.status, res.value.json);
    },
  };
}
