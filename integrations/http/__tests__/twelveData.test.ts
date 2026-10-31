import { createHttpClient, type FetchLike } from '../httpClient';
import { createTwelveDataProvider, parseTwelveDataResponse, twelveDataUrl } from '../twelveData';

/** Shaped like the documented `time_series` success response (twelvedata.com/docs, Time series). */
const SUCCESS = {
  meta: { symbol: 'EUR/USD', interval: '1h', currency_base: 'Euro', currency_quote: 'US Dollar', type: 'Physical Currency' },
  values: [
    { datetime: '2024-01-01 00:00:00', open: '1.10000', high: '1.10050', low: '1.09950', close: '1.10010' },
    { datetime: '2024-01-01 01:00:00', open: '1.10010', high: '1.10060', low: '1.09960', close: '1.10020' },
  ],
  status: 'ok',
};
/** The documented error shape, which can arrive with HTTP 200. */
const ERROR = (code: number) => ({ code, message: 'provider text that is never shown', status: 'error' });

describe('Twelve Data provider (spec §30)', () => {
  it('builds the documented URL in UTC and oldest-first, with no key in it', () => {
    const url = new URL(twelveDataUrl('EUR/USD', '1h', 500));
    expect(url.origin + url.pathname).toBe('https://api.twelvedata.com/time_series');
    expect(Object.fromEntries(url.searchParams)).toEqual({ symbol: 'EUR/USD', interval: '1h', outputsize: '500', timezone: 'UTC', order: 'asc', format: 'JSON' });
  });

  it('parses a success response into rows in UTC', () => {
    const r = parseTwelveDataResponse(200, SUCCESS);
    expect(r.ok && r.value).toMatchObject({ symbol: 'EUR/USD', currency: 'US Dollar', rowsTimeZone: 'UTC', rows: [{ datetime: '2024-01-01 00:00:00', close: '1.10010' }, {}] });
  });

  it.each([
    [401, /did not accept your API key/],
    [403, /plan does not include/],
    [404, /no data for that symbol/],
    [429, /request limit/],
    [500, /not answering properly/],
  ])('turns error %i (even with HTTP 200) into a plain message', (code, message) => {
    const r = parseTwelveDataResponse(200, ERROR(code));
    expect(!r.ok && r.error.message).toMatch(message);
    expect(!r.ok && r.error.message).not.toMatch(/provider text/);
  });

  it('refuses an unexpected shape', () => {
    expect(parseTwelveDataResponse(200, { values: 'nope' }).ok).toBe(false);
  });

  it('sends the key only in the Authorization header, never retries, and validates input', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(ERROR(429)), { status: 429 });
    };
    const provider = createTwelveDataProvider(createHttpClient(fetchImpl, async () => undefined));
    const r = await provider.fetchSeries({ apiKey: 'td-key-123456', symbol: 'eur/usd', timeframe: 'H1', candles: 100 });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).not.toMatch(/td-key/);
    expect(calls[0]?.url).toMatch(/symbol=EUR%2FUSD/);
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe('apikey td-key-123456');
    expect((await provider.fetchSeries({ apiKey: 'k', symbol: 'EUR USD; drop', timeframe: 'H1', candles: 100 })).ok).toBe(false);
    expect((await provider.fetchSeries({ apiKey: 'k', symbol: 'EURUSD', timeframe: 'H1', candles: 5001 })).ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
