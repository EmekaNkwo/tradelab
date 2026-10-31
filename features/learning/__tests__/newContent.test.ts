import { createTestHarness } from '../../../testing/harness';
import { contentWithoutModule } from '../../../testing/strategyFixtures';
import { toLocalDate } from '../../../domain/learning';
import { completeOnboarding, scheduleNewContent, type OnboardingInput } from '../useCases';

const NEW_MODULE = 'forex-rules-based-strategies';

const onboarding: OnboardingInput = {
  riskAcknowledged: true,
  experience: 'complete_beginner',
  markets: ['forex'],
  goals: ['understand_markets'],
  explanationLevel: 'simple',
  metaTrader: { version: 'mt5', installed: false },
  timeZone: 'Africa/Lagos',
  programId: 'practical-forex-trader',
  settings: { startDate: toLocalDate('2026-10-29'), timeline: { kind: 'weeks', weeks: 12 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
  classTime: '19:30',
  remindersEnabled: true,
  placementPassedModuleIds: [],
};

describe('scheduleNewContent', () => {
  // Content as it was before Phase 8 added module 9 to Practical Forex Trader.
  it('adds a module that a content update inserted into an active program', async () => {
    const h = await createTestHarness();
    const before = { ...h.container, content: contentWithoutModule(NEW_MODULE) };
    const enrolled = await completeOnboarding(before, onboarding);
    if (!enrolled.ok) throw new Error(enrolled.error.message);
    const units = async () => {
      const c = await h.container.learning.classes(enrolled.value.id);
      return c.ok ? c.value.flatMap((x) => x.unitIds) : [];
    };
    expect((await units()).some((u) => u.startsWith(`${NEW_MODULE}:`))).toBe(false);
    expect(await scheduleNewContent(before)).toEqual({ ok: true, value: false });

    const r = await scheduleNewContent(h.container);
    expect(r).toEqual({ ok: true, value: true });
    const after = await units();
    expect(after).toEqual(expect.arrayContaining([`${NEW_MODULE}:fx-ma-trend-following`, `${NEW_MODULE}:checkpoint`]));
    expect(after.indexOf(`${NEW_MODULE}:checkpoint`)).toBeLessThan(after.indexOf('forex-my-plan:checkpoint'));
    expect(await scheduleNewContent(h.container)).toEqual({ ok: true, value: false });
    h.db.close();
  });

  it('does nothing without an active enrolment', async () => {
    const h = await createTestHarness();
    expect(await scheduleNewContent(h.container)).toEqual({ ok: true, value: false });
    h.db.close();
  });
});
