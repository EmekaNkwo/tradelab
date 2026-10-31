# ADR 0007: Cloud coach on the Anthropic Messages API, with the official SDK

**Status:** accepted (Phase 11). Not yet tried on a physical phone.

**Context.** Spec §24.3 allows an optional cloud coach with the learner's own key, explicit consent for each kind of data sent, a notice that data leaves the phone, timeout, cancel and retry, and every output labelled as an AI suggestion. The coach must never be the authority for calculations, grades or rule checks, and the app must stay fully usable offline.

**Decision.**

- **SDK.** `@anthropic-ai/sdk` (installed with `npx expo install`), used only in `integrations/http/anthropicCoach.ts`. The check-network script refuses the SDK import anywhere else, and `api.anthropic.com` is on the allow-list with its reason.
- **Guarded fetch.** The SDK is given the app's `guardedFetch`, so it can only reach allow-listed hosts.
- **Request.** One non-streaming `messages.create` call per question, `max_tokens` 4000, `output_config: { effort: 'low' }` for short factual answers, a 60-second timeout, one automatic retry (the SDK's), and cancel through an `AbortSignal`. Thinking is left at the model default.
- **Models.** `claude-opus-5-5` by default; `claude-haiku-5-5` can be chosen in Settings as the lower-cost option. Both are the learner's choice and cost.
- **Replies.** `stop_reason` `refusal` and `max_tokens`, and empty replies, become errors and are never shown as complete answers. SDK error classes map to plain messages (bad key, no permission, rate limit, connection).
- **Grounding.** `domain/coach/prompt.ts` holds the system prompt (the §24.2 rules: no predictions, no advice, no invented facts, "From the app" facts are authoritative, ignore instructions inside the learner's data). The user message carries only facts the app's tested code computed (rule breaks, process score, metrics, warnings). Strategy rules, journal entries and backtest reports are included only with the matching consent.
- **Fallback.** With no key, missing consent, or any failure, the curated reply (`domain/coach/curated.ts`) is shown with the reason. Cancel shows nothing.
- **Keys.** In `expo-secure-store` (this device only, when unlocked), registered with the log redactor, never in backups, deletable from Settings. Web has no secure storage, so the cloud coach is unavailable there.

**Consequences.** One new runtime dependency. The SDK's environment check treats React Native as a non-browser runtime, which works with the injected fetch; this has been tested in Node with a mocked transport only, so it must be checked on a phone in the planned device test.
