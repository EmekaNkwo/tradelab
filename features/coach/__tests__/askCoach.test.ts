import { AI_SUGGESTION_LABEL, CURATED_LABEL, type CoachRequest } from '../../../domain/coach/types';
import type { AppSettings } from '../../../domain/models/learner';
import { providerUnavailable } from '../../../shared/errors';
import { err } from '../../../shared/result';
import { createTestHarness, type TestHarness } from '../../../testing/harness';
import { askCoach } from '../askCoach';
import { conceptContext, conceptRequest } from '../requests';

let h: TestHarness;
let base: AppSettings;
beforeEach(async () => {
  h = await createTestHarness();
  const s = await h.container.settings.get();
  if (!s.ok) throw new Error(s.error.message);
  base = s.value;
});
afterEach(() => h.db.close());

const withCoach = (coach: AppSettings['integrations']['coach'], consent = base.integrations.coachConsent): AppSettings => ({ ...base, integrations: { ...base.integrations, coach, coachConsent: consent } });
const concept = (): CoachRequest => conceptRequest(conceptContext(h.container.content, 'spread', 'simple'), 'simple', 'Why does it cost me?');
const backtest: CoachRequest = { task: 'explain_backtest', level: 'simple', backtest: { strategyName: 'S', dataLabel: 'Simulated data', metrics: [], warnings: [], strategyRules: null } };

describe('askCoach (spec §24)', () => {
  it('refuses when off, and answers offline from the app’s lessons in curated mode', async () => {
    expect((await askCoach(h.container, withCoach('off'), concept())).ok).toBe(false);
    const r = await askCoach(h.container, withCoach('curated'), concept());
    expect(r.ok && r.value).toMatchObject({ source: 'curated', label: CURATED_LABEL, fallbackReason: null });
    expect(h.cloudCoach.requests).toHaveLength(0);
  });

  it('uses the cloud with a key, labels the answer "AI suggestion", and keeps the app’s definition in the message', async () => {
    await h.container.secrets.set('anthropic_api_key', 'sk-ant-0123456789abcdef');
    const r = await askCoach(h.container, withCoach('cloud'), concept());
    expect(r.ok && r.value).toMatchObject({ source: 'cloud', label: AI_SUGGESTION_LABEL, fallbackReason: null });
    expect(h.cloudCoach.requests[0]).toMatchObject({ apiKey: 'sk-ant-0123456789abcdef', model: 'claude-haiku-5-5' });
    expect(h.cloudCoach.requests[0]?.message).toMatch(/app's own definition/);
  });

  it('falls back to curated, with the reason, when there is no key, no consent, or the call fails', async () => {
    const noKey = await askCoach(h.container, withCoach('cloud'), concept());
    expect(noKey.ok && noKey.value.fallbackReason).toMatch(/No Anthropic key/);
    await h.container.secrets.set('anthropic_api_key', 'sk-ant-0123456789abcdef');
    const noConsent = await askCoach(h.container, withCoach('cloud'), backtest);
    expect(noConsent.ok && noConsent.value.fallbackReason).toMatch(/not agreed to share backtest reports/);
    expect(h.cloudCoach.requests).toHaveLength(0);
    h.cloudCoach.next = err(providerUnavailable('Could not reach Anthropic'));
    const failed = await askCoach(h.container, withCoach('cloud'), concept());
    expect(failed.ok && failed.value).toMatchObject({ source: 'curated', fallbackReason: expect.stringMatching(/could not answer/) });
  });

  it('returns Cancelled, not a fallback, when the learner cancels', async () => {
    await h.container.secrets.set('anthropic_api_key', 'sk-ant-0123456789abcdef');
    const controller = new AbortController();
    controller.abort();
    const r = await askCoach(h.container, withCoach('cloud'), concept(), controller.signal);
    expect(!r.ok && r.error.kind).toBe('Cancelled');
  });
});
