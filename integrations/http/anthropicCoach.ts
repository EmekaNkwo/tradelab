import Anthropic from '@anthropic-ai/sdk';
import type { CloudCoachTransport } from '../../data/coach/types';
import { cancelled, fromUnknown, shownError, timeoutError, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { guardedFetch, type FetchLike } from './httpClient';

/**
 * The optional cloud coach (spec §24.3) on the Anthropic Messages API, with
 * the official TypeScript SDK (ADR 0007) and the learner's own key. The SDK
 * is given the app's guarded fetch, so it can only reach the allow-listed
 * host. One short, non-streaming request per question: a timeout, one
 * automatic retry for rate limits and server errors, and cancel through an
 * AbortSignal. Refusals and cut-off replies are reported, never shown as
 * if complete.
 */

export const COACH_TIMEOUT_MS = 60_000;
/**
 * A reply of about 250 words is roughly 350 to 400 tokens. Thinking counts
 * toward max_tokens on Haiku 5.5 and Opus 5.5 (adaptive thinking is on by
 * default), so low effort plus this cap leaves room for a little thinking
 * without paying for long answers.
 */
export const COACH_MAX_TOKENS = 1500;

function describeSdkError(cause: unknown, signal?: AbortSignal): AppError {
  if (signal?.aborted || cause instanceof Anthropic.APIUserAbortError) return cancelled('The coach request was cancelled');
  if (cause instanceof Anthropic.APIConnectionTimeoutError) return timeoutError('The coach took too long to answer');
  if (cause instanceof Anthropic.AuthenticationError) return validationError('Anthropic did not accept your API key. Check it in Settings → Data and AI services.');
  if (cause instanceof Anthropic.PermissionDeniedError) return validationError('Your Anthropic key cannot use this model. Try the other model in Settings.');
  if (cause instanceof Anthropic.RateLimitError) return shownError('ProviderUnavailable', 'Anthropic’s rate limit for your key was reached. Wait a little and try again.');
  if (cause instanceof Anthropic.BadRequestError) return validationError('Anthropic did not accept the request.');
  if (cause instanceof Anthropic.APIConnectionError) return shownError('ProviderUnavailable', 'Could not reach Anthropic. Check your connection.');
  if (cause instanceof Anthropic.APIError) return shownError('ProviderUnavailable', `Anthropic returned an error (HTTP ${cause.status ?? 'unknown'})`);
  return fromUnknown('ProviderUnavailable', 'The coach request failed', cause instanceof Error ? cause.message : 'unknown error');
}

export function createAnthropicCoachTransport(fetchImpl?: FetchLike): CloudCoachTransport {
  const fetch = guardedFetch(fetchImpl);
  return {
    providerName: 'Anthropic',
    async send(req): Promise<Result<{ readonly text: string }, AppError>> {
      const client = new Anthropic({ apiKey: req.apiKey, fetch, timeout: COACH_TIMEOUT_MS, maxRetries: 1 });
      try {
        const response = await client.messages.create(
          {
            model: req.model,
            max_tokens: COACH_MAX_TOKENS,
            // Short, factual coaching answers: low effort keeps them quick and cheap.
            output_config: { effort: 'low' },
            system: req.system,
            messages: [{ role: 'user', content: req.message }],
          },
          { signal: req.signal },
        );
        if (response.stop_reason === 'refusal') return err(shownError('ProviderUnavailable', 'The coach declined to answer this request'));
        const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n\n').trim();
        if (response.stop_reason === 'max_tokens') return err(shownError('ProviderUnavailable', 'The coach’s answer was cut off'));
        if (text.length === 0) return err(shownError('ProviderUnavailable', 'The coach returned an empty answer'));
        return ok({ text });
      } catch (cause) {
        const error = describeSdkError(cause, req.signal);
        if (error.kind !== 'Cancelled') logger.warn('Cloud coach request failed', { kind: error.kind });
        return err(error);
      }
    },
  };
}
