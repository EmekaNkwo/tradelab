import { useCallback, useEffect, useRef, useState } from 'react';
import { curatedReply, requestFacts } from '../../domain/coach/curated';
import { buildCoachMessage, COACH_SYSTEM_PROMPT, consentGaps, replyParagraphs } from '../../domain/coach/prompt';
import { AI_SUGGESTION_LABEL, type CoachReply, type CoachRequest } from '../../domain/coach/types';
import type { AppSettings } from '../../domain/models/learner';
import { cancelled, errorText, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { useContainer, type Container } from '../app';

/**
 * Asks the coach (spec §24). Curated replies are always available. The cloud
 * coach is used only when the learner chose it, saved a key, and agreed to
 * share every kind of data in the request; otherwise, or when the cloud
 * request fails, the curated reply is shown with the reason. Cancelling
 * returns a Cancelled error and shows nothing.
 */

export const CONSENT_LABELS = { journal: 'journal entries', strategies: 'strategy rules', backtests: 'backtest reports' } as const;

export async function askCoach(c: Pick<Container, 'secrets' | 'cloudCoach'>, settings: AppSettings, req: CoachRequest, signal?: AbortSignal): Promise<Result<CoachReply, AppError>> {
  const { coach, coachConsent, cloudModel } = settings.integrations;
  if (coach === 'off') return err(validationError('The coach is off. Turn it on in Settings → Data and AI services.'));
  if (coach === 'curated') return ok(curatedReply(req));
  const gaps = consentGaps(req, coachConsent);
  if (gaps.length > 0) return ok(curatedReply(req, `You have not agreed to share ${gaps.map((g) => CONSENT_LABELS[g]).join(' or ')} with ${c.cloudCoach.providerName}, so this answer comes from the app’s own lessons.`));
  const key = await c.secrets.get('anthropic_api_key');
  if (!key.ok || !key.value) return ok(curatedReply(req, 'No Anthropic key is saved, so this answer comes from the app’s own lessons.'));
  const message = buildCoachMessage(req, coachConsent);
  if (!message.ok) return ok(curatedReply(req, 'This request needs data you have not agreed to share, so this answer comes from the app’s own lessons.'));
  const sent = await c.cloudCoach.send({ apiKey: key.value, model: cloudModel, system: COACH_SYSTEM_PROMPT, message: message.value, signal });
  if (signal?.aborted) return err(cancelled('The coach request was cancelled'));
  if (!sent.ok) {
    if (sent.error.kind === 'Cancelled') return sent;
    return ok(curatedReply(req, `The cloud coach could not answer (${errorText(sent.error)}), so this answer comes from the app’s own lessons.`));
  }
  const paragraphs = replyParagraphs(sent.value.text);
  if (paragraphs.length === 0) return ok(curatedReply(req, 'The cloud coach returned an empty answer, so this answer comes from the app’s own lessons.'));
  return ok({ source: 'cloud', label: AI_SUGGESTION_LABEL, paragraphs, facts: requestFacts(req), ungraded: req.task === 'extra_practice', fallbackReason: null });
}

export type CoachState =
  | { readonly status: 'idle' }
  | { readonly status: 'asking'; readonly cloud: boolean }
  | { readonly status: 'answered'; readonly reply: CoachReply }
  | { readonly status: 'error'; readonly error: AppError };

/** One coach conversation turn with Cancel and Try again; leaving the screen cancels a request in flight. */
export function useCoach() {
  const c = useContainer();
  const [state, setState] = useState<CoachState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const last = useRef<CoachRequest | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const ask = useCallback(
    async (req: CoachRequest) => {
      if (controller.current) return;
      // Claimed before the first await, so a second press cannot send a second request.
      const ac = new AbortController();
      controller.current = ac;
      last.current = req;
      setState({ status: 'asking', cloud: false });
      const settings = await c.settings.get();
      if (controller.current !== ac) return;
      if (!settings.ok) {
        controller.current = null;
        return setState({ status: 'error', error: settings.error });
      }
      setState({ status: 'asking', cloud: settings.value.integrations.coach === 'cloud' });
      const r = await askCoach(c, settings.value, req, ac.signal);
      if (controller.current !== ac) return;
      controller.current = null;
      if (!r.ok && r.error.kind === 'Cancelled') return setState({ status: 'idle' });
      setState(r.ok ? { status: 'answered', reply: r.value } : { status: 'error', error: r.error });
    },
    [c],
  );
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: 'idle' });
  }, []);
  const retry = useCallback(() => {
    if (last.current) void ask(last.current);
  }, [ask]);
  return { state, ask, cancel, retry, reset: () => setState({ status: 'idle' }) };
}
