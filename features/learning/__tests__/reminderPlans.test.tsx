import { act, renderHook } from '@testing-library/react-native';
import { toLocalDate } from '../../../domain/learning/dates';
import type { UtcIso } from '../../../shared/time';
import { createTestHarness, TestProviders, TEST_NOW } from '../../../testing/testContainer';
import { exportBackup, restorePickedBackup } from '../../backup/useCases';
import { useUpdateSettings } from '../../settings';
import { BACKGROUND, completeOnboarding, finishReview, resyncReminders, reviewsWaiting, type OnboardingInput } from '../useCases';
import type { Enrolment } from '../../../domain/models/learning';
import { classReminderPlan, offsetSlot, reminderPlans, type ReminderContext } from '../reminderPlans';
import type { WeeklySlot } from '../../../data';

const enrolment = (o: Partial<Enrolment> = {}): Enrolment =>
  ({
    id: 'e',
    programId: 'p',
    status: 'active',
    classTime: '19:30',
    remindersEnabled: true,
    settings: { studyDays: [1, 3, 5] },
    ...o,
  }) as Enrolment;

const ctx = (o: Partial<ReminderContext> = {}): ReminderContext => ({
  enrolment: enrolment(),
  reminders: { weakReview: true, weeklySummary: true, backup: true },
  reviewsWaiting: 2,
  ...o,
});

/** Words a learning reminder must never use (spec §29: nothing that pushes trading or price watching). */
const PUSHY = /\b(trade|trades|trading|price|prices|market|markets|buy|sell|profit|signal)\b|opportunit/i;

describe('learning reminders (spec §29)', () => {
  it('schedules class, spaced-review (rest days), weekly summary and backup reminders, offset from class time', () => {
    const plans = reminderPlans(ctx());
    expect(plans.map((p) => p.kind)).toEqual(['class', 'weak_review', 'weekly_summary', 'backup']);
    expect(plans[0]?.slots).toEqual([1, 3, 5].map((weekday) => ({ weekday, hour: 19, minute: 30 })));
    expect(plans[1]?.slots.map((s) => s.weekday)).toEqual([0, 2, 4, 6]);
    expect(plans[1]?.slots[0]).toEqual({ weekday: 0, hour: 20, minute: 30 });
    expect(plans[2]?.slots).toEqual([{ weekday: 0, hour: 21, minute: 30 }]);
    expect(plans[3]?.slots).toEqual([{ weekday: 6, hour: 21, minute: 30 }]);
  });

  it('never pushes trading or price watching', () => {
    for (const p of reminderPlans(ctx())) expect(`${p.title} ${p.body}`).not.toMatch(PUSHY);
  });

  it('needs the class reminder on and respects each toggle', () => {
    expect(reminderPlans(ctx({ enrolment: enrolment({ remindersEnabled: false }) }))).toEqual([]);
    expect(reminderPlans(ctx({ enrolment: enrolment({ status: 'paused' }) }))).toEqual([]);
    expect(reminderPlans(ctx({ enrolment: null }))).toEqual([]);
    expect(reminderPlans(ctx({ reminders: { weakReview: false, weeklySummary: false, backup: false } })).map((p) => p.kind)).toEqual(['class']);
  });

  it('skips the spaced-review reminder with nothing waiting or no rest days; schedules the backup one whenever it is on', () => {
    expect(reminderPlans(ctx({ reviewsWaiting: 0 })).map((p) => p.kind)).not.toContain('weak_review');
    expect(reminderPlans(ctx({ enrolment: enrolment({ settings: { studyDays: [0, 1, 2, 3, 4, 5, 6] } as unknown as Enrolment['settings'] }) })).map((p) => p.kind)).not.toContain('weak_review');
    // It must still fire if the app is not opened for weeks, so it does not depend on the last backup date.
    expect(reminderPlans(ctx()).find((p) => p.kind === 'backup')?.body).toMatch(/if you have not saved a backup/i);
    expect(classReminderPlan(enrolment({ classTime: null }))).toBeNull();
  });

  it('rolls late offsets over to the next day instead of squeezing them before midnight', () => {
    const e = enrolment({ classTime: '23:15' });
    expect(offsetSlot(e, 6, 1)).toEqual({ weekday: 0, hour: 0, minute: 15 });
    expect(offsetSlot(e, 0, 2)).toEqual({ weekday: 1, hour: 1, minute: 15 });
    expect(offsetSlot(enrolment({ classTime: '08:00' }), 3, 2)).toEqual({ weekday: 3, hour: 10, minute: 0 });
  });

  it('never fires two reminders at the same moment, for any class time and study days', () => {
    const key = (s: WeeklySlot) => `${s.weekday}-${s.hour}-${s.minute}`;
    for (let hour = 0; hour < 24; hour += 1) {
      for (let mask = 1; mask < 128; mask += 1) {
        const studyDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => mask & (1 << d));
        const plans = reminderPlans(ctx({ enrolment: enrolment({ classTime: `${hour}:45`, settings: { studyDays } as unknown as Enrolment['settings'] }) }));
        const slots = plans.flatMap((p) => p.slots.map(key));
        expect(new Set(slots).size).toBe(slots.length);
      }
    }
  });

  it('counts reviews waiting: due now, or missed and still in box 1 or 2', () => {
    const today = toLocalDate('2026-10-29');
    const item = (o: object) => ({ conceptId: 'q', box: 3, dueDate: toLocalDate('2026-11-05'), lapses: 0, ...o });
    expect(reviewsWaiting([item({})], today)).toBe(0);
    expect(reviewsWaiting([item({ dueDate: today })], today)).toBe(1);
    expect(reviewsWaiting([item({ lapses: 1, box: 2 })], today)).toBe(1);
    expect(reviewsWaiting([item({ lapses: 1, box: 3 })], today)).toBe(0);
  });
});

describe('reminder resync (spec §29)', () => {
  const input = {
    riskAcknowledged: true,
    experience: 'complete_beginner',
    markets: ['forex'],
    goals: ['understand_markets'],
    explanationLevel: 'simple',
    metaTrader: { version: 'mt5', installed: false },
    timeZone: 'Africa/Lagos',
    programId: 'practical-forex-trader',
    settings: { startDate: toLocalDate('2026-10-29'), timeline: { kind: 'weeks', weeks: 2 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
    classTime: '19:30',
    remindersEnabled: true,
    placementPassedModuleIds: [],
  } as const satisfies OnboardingInput;

  it('turns new reminder types off by default and only prompts for permission from learner actions', async () => {
    const h = await createTestHarness();
    expect((await completeOnboarding(h.container, input)).ok).toBe(true);
    expect(h.reminders.synced.at(-1)?.map((p) => p.kind)).toEqual(['class']);
    expect(h.reminders.options.at(-1)).toEqual({ prompt: true });
    expect(await resyncReminders(h.container, BACKGROUND)).toBe('scheduled');
    expect(h.reminders.options.at(-1)).toEqual({ prompt: false });
    h.db.close();
  });

  it('updates reminders after a settings change, a spaced review and a restore', async () => {
    const h = await createTestHarness();
    expect((await completeOnboarding(h.container, input)).ok).toBe(true);
    await h.container.learning.saveReviewItems([{ conceptId: 'fx-position-sizing-q1', box: 1, dueDate: toLocalDate('2026-10-29'), lapses: 1 }], TEST_NOW as UtcIso);
    const { result } = await renderHook(() => useUpdateSettings(), { wrapper: ({ children }) => <TestProviders container={h.container}>{children}</TestProviders> });
    await act(async () => {
      await result.current({ reminders: { weakReview: true, weeklySummary: false, backup: true } });
    });
    expect(h.reminders.synced.at(-1)?.map((p) => p.kind)).toEqual(['class', 'weak_review', 'backup']);
    expect(h.reminders.options.at(-1)).toEqual({ prompt: true });
    expect(h.reminders.latest('weak_review')?.slots.map((s) => s.weekday)).toEqual([0, 6]);

    // Right on the day it was due: it moves to box 2, but a missed item in box 2 still counts as waiting.
    expect((await finishReview(h.container, [{ questionId: 'fx-position-sizing-q1', correct: true }])).ok).toBe(true);
    expect(h.reminders.options.at(-1)).toEqual({ prompt: false });
    await h.container.learning.saveReviewItems([{ conceptId: 'fx-position-sizing-q1', box: 3, dueDate: toLocalDate('2026-11-02'), lapses: 1 }], TEST_NOW as UtcIso);
    expect((await finishReview(h.container, [{ questionId: 'fx-position-sizing-q1', correct: true }])).ok).toBe(true);
    expect(h.reminders.synced.at(-1)?.map((p) => p.kind)).toEqual(['class', 'backup']);

    const exported = await h.container.backup.prepare(TEST_NOW as UtcIso);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const parsed = h.container.backup.parse(exported.value.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const before = h.reminders.synced.length;
    expect((await restorePickedBackup(h.container, parsed.value)).ok).toBe(true);
    expect(h.reminders.synced.length).toBe(before + 1);
    expect(h.reminders.options.at(-1)).toEqual({ prompt: false });
    expect((await exportBackup(h.container)).ok).toBe(true);
    h.db.close();
  });
});
