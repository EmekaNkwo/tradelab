import { createHttpClient, guardedFetch, MAX_RESPONSE_CHARS, type FetchLike } from '../httpClient';
import { isAllowedUrl } from '../allowedHosts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const URL_OK = 'https://api.twelvedata.com/time_series?symbol=EUR%2FUSD';
const noSleep = async () => undefined;

describe('HTTP client (spec §34)', () => {
  it('allows only https on the approved hosts, without credentials in the URL', () => {
    expect(isAllowedUrl(URL_OK)).toBe(true);
    expect(isAllowedUrl('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(isAllowedUrl('http://api.twelvedata.com/time_series')).toBe(false);
    expect(isAllowedUrl('https://evil.example.com/')).toBe(false);
    expect(isAllowedUrl('https://user:pw@api.twelvedata.com/')).toBe(false);
    expect(isAllowedUrl('not a url')).toBe(false);
  });

  it('refuses other hosts before any request, and the guarded fetch throws for them', async () => {
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>();
    const r = await createHttpClient(fetchImpl, noSleep).request({ url: 'https://evil.example.com/x' });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(guardedFetch(fetchImpl)('https://evil.example.com/x')).rejects.toThrow(/not allowed/);
  });

  it('returns status and JSON, and refuses a non-JSON body', async () => {
    const ok = await createHttpClient(async () => json(200, { a: 1 }), noSleep).request({ url: URL_OK });
    expect(ok).toEqual({ ok: true, value: { status: 200, json: { a: 1 } } });
    const bad = await createHttpClient(async () => new Response('<html>', { status: 502 }), noSleep).request({ url: URL_OK });
    expect(!bad.ok && bad.error.kind).toBe('ProviderUnavailable');
  });

  it('retries 429 and 5xx up to the limit, but not other errors', async () => {
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>().mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(429, {})).mockResolvedValueOnce(json(200, { done: true }));
    const r = await createHttpClient(fetchImpl, noSleep).request({ url: URL_OK, retries: 2 });
    expect(r.ok && r.value.json).toEqual({ done: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const once = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>().mockResolvedValue(json(401, {}));
    await createHttpClient(once, noSleep).request({ url: URL_OK, retries: 3 });
    expect(once).toHaveBeenCalledTimes(1);
  });

  it('times out and cancels', async () => {
    const hang: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const timedOut = await createHttpClient(hang, noSleep).request({ url: URL_OK, timeoutMs: 5 });
    expect(!timedOut.ok && timedOut.error.kind).toBe('Timeout');
    const controller = new AbortController();
    const pending = createHttpClient(hang, noSleep).request({ url: URL_OK, signal: controller.signal });
    controller.abort();
    const r = await pending;
    expect(!r.ok && r.error.kind).toBe('Cancelled');
  });
});

describe('HTTP client hardening (I)', () => {
  const withUrl = (res: Response, url: string) => Object.defineProperty(res, 'url', { value: url });

  it('requires the default HTTPS port', () => {
    expect(isAllowedUrl('https://api.twelvedata.com:443/x')).toBe(true);
    expect(isAllowedUrl('https://api.twelvedata.com:8443/x')).toBe(false);
  });

  it('never follows redirects, and refuses a response that landed on another host', async () => {
    const fetchImpl = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () => withUrl(json(200, {}), 'https://evil.example.com/x'));
    const r = await createHttpClient(fetchImpl, noSleep).request({ url: URL_OK });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
    expect(!r.ok && r.error.message).toMatch(/not allowed/);
    const guarded = guardedFetch(fetchImpl);
    await expect(guarded('https://api.anthropic.com/v1/messages', { method: 'POST' })).rejects.toThrow(/not allowed/);
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', redirect: 'error' });
    fetchImpl.mockImplementation(async () => withUrl(json(200, {}), 'https://api.anthropic.com/v1/messages'));
    await expect(guarded('https://api.anthropic.com/v1/messages')).resolves.toBeTruthy();
  });

  it('refuses a body whose declared length is over the cap without reading it', async () => {
    const text = jest.fn(async () => '{}');
    const big = { status: 200, url: URL_OK, headers: new Headers({ 'content-length': String(MAX_RESPONSE_CHARS + 1) }), text } as unknown as Response;
    const r = await createHttpClient(async () => big, noSleep).request({ url: URL_OK });
    expect(!r.ok && r.error.message).toMatch(/too large/);
    expect(text).not.toHaveBeenCalled();
    const huge = { status: 200, url: URL_OK, headers: new Headers(), text: async () => 'x'.repeat(MAX_RESPONSE_CHARS + 1) } as unknown as Response;
    const r2 = await createHttpClient(async () => huge, noSleep).request({ url: URL_OK });
    expect(!r2.ok && r2.error.message).toMatch(/too large/);
  });
});
