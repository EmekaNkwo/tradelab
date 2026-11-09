import { suggestedProgramId, toLocalDate } from '../../../domain/learning';
import { createTestHarness } from '../../../testing/harness';
import { describeMatch, updateLearningPreferences } from '../preferences';
import { completeOnboarding, type OnboardingInput } from '../useCases';

const FOREX = 'practical-forex-trader';
const DEV = 'trader-development';

const onboarding: OnboardingInput = {
  riskAcknowledged: true,
  experience: 'complete_beginner',
  markets: ['forex'],
  goals: ['understand_markets'],
  explanationLevel: 'simple',
  metaTrader: null,
  timeZone: 'Africa/Lagos',
  programId: FOREX,
  settings: { startDate: toLocalDate('2026-10-29'), timeline: { kind: 'weeks', weeks: 12 }, studyDays: [1, 3, 5], dailyMinutes: 30 },
  classTime: '19:30',
  remindersEnabled: false,
  placementPassedModuleIds: [],
};

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('learning preferences (Settings → What I want to learn)', () => {
  it('saves new experience, markets and goals and leaves the program, schedule and the rest of the profile alone', async () => {
    const h = await createTestHarness();
    const enrolment = unwrap(await completeOnboarding(h.container, onboarding));
    const before = unwrap(await h.container.profile.get())!;
    const classesBefore = unwrap(await h.container.learning.classes(enrolment.id));

    const saved = unwrap(await updateLearningPreferences(h.container, { experience: 'have_traded', markets: ['stocks', 'futures'], goals: ['risk_management'] }));

    expect(saved).toMatchObject({ experience: 'have_traded', markets: ['stocks', 'futures'], goals: ['risk_management'] });
    expect({ ...saved, experience: before.experience, markets: before.markets, goals: before.goals, updatedAt: before.updatedAt }).toEqual(before);
    expect(unwrap(await h.container.profile.get())).toEqual(saved);
    expect(unwrap(await h.container.learning.enrolments())).toEqual([enrolment]);
    expect(unwrap(await h.container.learning.classes(enrolment.id))).toEqual(classesBefore);
  });

  it('accepts options as a market to study, and reads it back from storage', async () => {
    const h = await createTestHarness();
    unwrap(await completeOnboarding(h.container, onboarding));
    unwrap(await updateLearningPreferences(h.container, { experience: 'know_basic_terms', markets: ['stocks', 'options'], goals: ['risk_management'] }));
    expect(unwrap(await h.container.profile.get())?.markets).toEqual(['stocks', 'options']);
  });

  it('refuses empty or unknown choices without saving', async () => {
    const h = await createTestHarness();
    unwrap(await completeOnboarding(h.container, onboarding));
    const before = unwrap(await h.container.profile.get());
    for (const bad of [
      { experience: 'have_traded', markets: [], goals: ['risk_management'] },
      { experience: 'have_traded', markets: ['forex'], goals: [] },
      { experience: 'have_traded', markets: ['bonds'], goals: ['risk_management'] },
      { experience: 'expert', markets: ['forex'], goals: ['risk_management'] },
    ] as const) {
      const r = await updateLearningPreferences(h.container, bad as never);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('ValidationError');
    }
    expect(unwrap(await h.container.profile.get())).toEqual(before);
  });

  it('needs a finished onboarding first', async () => {
    const h = await createTestHarness();
    const r = await updateLearningPreferences(h.container, { experience: 'have_traded', markets: ['forex'], goals: ['risk_management'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('NotFound');
  });

  it('suggests the matching shipped program for each market', async () => {
    const { container: c } = await createTestHarness();
    const pick = (markets: OnboardingInput['markets']) => suggestedProgramId(c.content.programs(), (id) => c.content.module(id), { experience: 'complete_beginner', markets, goals: [] });
    expect(pick(['forex'])).toBe(FOREX);
    expect(pick(['stocks'])).toBe(DEV);
    expect(pick(['futures', 'commodities'])).toBe(DEV);
  });

  it('describes a match in the learner’s own words', () => {
    expect(describeMatch({ markets: ['stocks'], goals: ['risk_management'] })).toBe('Matches your choices: Ordinary stocks, Risk management');
    expect(describeMatch({ markets: [], goals: [] })).toBeNull();
  });
});
