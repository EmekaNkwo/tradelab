import { cancelled, fromUnknown, providerUnavailable, timeoutError, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { redactText } from '../../shared/redact';
import { err, ok, type Result } from '../../shared/result';
import { isAllowedUrl } from './allowedHosts';

/**
 * The app's one network client (spec §32A.6). Only allow-listed HTTPS hosts,
 * a timeout on every request, cancel through an AbortSignal, and a small
 * number of retries for network errors, 429 and 5xx. URLs are logged with
 * secrets redacted; bodies and headers are never logged.
 */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface HttpRequest {
  readonly url: string;
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Extra attempts after the first, for network errors, 429 and 5xx. */
  readonly retries?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly json: unknown;
}

export const DEFAULT_TIMEOUT_MS = 20_000;
export const MAX_RESPONSE_CHARS = 8 * 1024 * 1024;

/** The response landed on another host (a redirect the platform followed anyway): refuse it. */
function landedElsewhere(res: Response): boolean {
  return typeof res.url === 'string' && res.url !== '' && !isAllowedUrl(res.url);
}

/** A declared body larger than the cap is refused before it is read. */
function declaredTooLarge(res: Response): boolean {
  const length = Number(res.headers?.get?.('content-length') ?? NaN);
  return Number.isFinite(length) && length > MAX_RESPONSE_CHARS;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * A fetch that refuses hosts outside the allow-list and never follows
 * redirects (a redirect could lead off the list). Given to third-party SDKs
 * so they obey the same rule.
 */
export function guardedFetch(base: FetchLike = (input, init) => fetch(input, init)): FetchLike {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!isAllowedUrl(url)) throw new Error(`Blocked request to a host that is not allowed: ${redactText(url.split('?')[0] ?? '')}`);
    const res = await base(input, { ...init, redirect: 'error' });
    if (landedElsewhere(res)) throw new Error('Blocked a response from a host that is not allowed');
    return res;
  };
}

export interface HttpClient {
  request(req: HttpRequest): Promise<Result<HttpResponse, AppError>>;
}

export function createHttpClient(fetchImpl: FetchLike = (input, init) => fetch(input, init), sleep: (ms: number, signal?: AbortSignal) => Promise<void> = wait): HttpClient {
  const once = async (req: HttpRequest): Promise<Result<HttpResponse, AppError>> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetchImpl(req.url, { method: req.method ?? 'GET', headers: req.headers, body: req.body, signal: controller.signal, redirect: 'error' });
      if (landedElsewhere(res)) return err(validationError('The service answered from an address the app is not allowed to contact'));
      if (declaredTooLarge(res)) return err(providerUnavailable('The response was too large'));
      const text = await res.text();
      if (text.length > MAX_RESPONSE_CHARS) return err(providerUnavailable('The response was too large'));
      let json: unknown = null;
      try {
        json = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        return err(providerUnavailable(`The service returned something that is not JSON (HTTP ${res.status})`));
      }
      return ok({ status: res.status, json });
    } catch (cause) {
      if (req.signal?.aborted) return err(cancelled('The request was cancelled'));
      if (timedOut) return err(timeoutError('The request timed out'));
      return err(fromUnknown('ProviderUnavailable', 'The request failed', redactText(cause instanceof Error ? cause.message : String(cause))));
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onAbort);
    }
  };

  return {
    async request(req) {
      if (!isAllowedUrl(req.url)) return err(validationError('That address is not one the app is allowed to contact'));
      const attempts = 1 + Math.max(0, Math.min(req.retries ?? 0, 3));
      let last: Result<HttpResponse, AppError> = err(providerUnavailable('No attempt was made'));
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (req.signal?.aborted) return err(cancelled('The request was cancelled'));
        last = await once(req);
        const retryable = last.ok ? last.value.status === 429 || last.value.status >= 500 : last.error.kind === 'ProviderUnavailable' || last.error.kind === 'Timeout';
        if (!retryable || attempt === attempts - 1) break;
        logger.warn('Retrying a request', { url: redactText(req.url.split('?')[0] ?? ''), attempt: attempt + 1 });
        await sleep(500 * 2 ** attempt, req.signal);
      }
      return last;
    },
  };
}
