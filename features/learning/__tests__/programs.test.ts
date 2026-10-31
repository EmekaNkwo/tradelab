import { toLocalDate } from '../../../domain/learning';
import type { Enrolment } from '../../../domain/models/learning';
import type { UtcIso } from '../../../shared/time';
import { createTestHarness, movableClock, type TestHarness } from '../../../testing/harness';
import { lessonDisclosures } from '../disclosureRules';
import { programList } from '../programList';
import { addProgram, completeOnboarding, settingsForNewProgram, startQueuedProgram, type OnboardingInput } from '../useCases';

const FOREX = 'practical-forex-trader';
const DEV = 'trader-development';
const START = toLocalDate('2026-10-29');

const onboarding: OnboardingInput = {
  riskAcknowledged: true,
  experience: 'complete_beginner',
  markets: ['forex'],
  goals: ['understand_markets'],
  explanationLevel: 'simple',
  metaTrader: { version: 'mt5', installed: false },
  timeZone: 'Africa/Lagos',
  programId: FOREX,
  settings: { startDate: START, timeline: { kind: 'weeks', weeks: 12 }, studyDays: [1, 3, 5], dailyMinutes: 30 },
  classTime: '19:30',
  remindersEnabled: true,
  placementPassedModuleIds: [],
};

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

async function onboarded(clock = movableClock()) {
  const h = await createTestHarness(undefined, clock);
  const forex = unwrap(await completeOnboarding(h.container, onboarding));
  return { h, clock, forex };
}

const enrolments = async (h: TestHarness) => unwrap(await h.container.learning.enrolments());
const classes = async (h: TestHarness, e: Enrolment) => unwrap(await h.container.learning.classes(e.id));

describe('programs (spec §6.1)', () => {
  it('a new program copies the learner’s rhythm and starts today over its suggested length', () => {
    expect(settingsForNewProgram(16, null, START)).toEqual({ startDate: START, timeline: { kind: 'weeks', weeks: 16 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 });
  });

  it('adding a program while one is under way queues it, with no classes yet', async () => {
    const { h, forex } = await onboarded();
    const dev = unwrap(await addProgram(h.container, DEV));
    expect(dev.status).toBe('queued');
    expect(dev.settings.studyDays).toEqual([1, 3, 5]);
    expect(dev.settings.dailyMinutes).toBe(30);
    expect(await classes(h, dev)).toEqual([]);
    expect(unwrap(await h.container.learning.currentEnrolment())?.id).toBe(forex.id);

    const list = programList(h.container.content.programs(), await enrolments(h));
    expect(list.map((i) => [i.program.id, i.state, i.queuePlace])).toEqual([
      [FOREX, 'active', null],
      [DEV, 'queued', 1],
    ]);
  });

  it('refuses unknown programs and programs already in the list', async () => {
    const { h } = await onboarded();
    expect((await addProgram(h.container, 'nope')).ok).toBe(false);
    expect((await addProgram(h.container, FOREX)).ok).toBe(false);
    unwrap(await addProgram(h.container, DEV));
    const again = await addProgram(h.container, DEV);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toMatch(/already in your list/);
  });

  it('starting a queued program swaps it with the one under way, keeping progress, and moves reminders', async () => {
    const { h, clock, forex } = await onboarded();
    const forexClasses = (await classes(h, forex)).length;
    const dev = unwrap(await addProgram(h.container, DEV));
    clock.set('2026-11-02T09:00:00.000Z');
    const started = unwrap(await startQueuedProgram(h.container, dev));
    expect(started.status).toBe('active');
    const devClasses = await classes(h, started);
    expect(devClasses.length).toBeGreaterThan(0);
    expect(devClasses[0]?.date).toBe('2026-11-02');
    expect(h.reminders.latest()?.slots.length).toBe(3);

    const all = await enrolments(h);
    expect(all.find((e) => e.id === forex.id)?.status).toBe('queued');
    expect(unwrap(await h.container.learning.currentEnrolment())?.id).toBe(dev.id);
    // The forex history is kept while it waits.
    expect((await classes(h, forex)).length).toBe(forexClasses);

    // Swap back: the forex program is rebuilt from today, pushed back by the days it waited.
    clock.set('2026-11-09T09:00:00.000Z');
    const queuedForex = (await enrolments(h)).find((e) => e.id === forex.id) as Enrolment;
    const back = unwrap(await startQueuedProgram(h.container, queuedForex));
    expect(back.status).toBe('active');
    const planned = (await classes(h, back)).filter((c) => c.status === 'planned');
    expect(planned.every((c) => c.date >= '2026-11-09')).toBe(true);
    expect((await enrolments(h)).find((e) => e.id === dev.id)?.status).toBe('queued');
  });

  it('only a queued program can be started', async () => {
    const { h, forex } = await onboarded();
    expect((await startQueuedProgram(h.container, forex)).ok).toBe(false);
    expect((await h.container.learning.activateEnrolment(forex.id, [], forex.settings, '2026-10-29T10:00:00.000Z' as UtcIso)).ok).toBe(false);
  });

  it('adding a program with nothing under way starts it at once', async () => {
    const h = await createTestHarness(undefined, movableClock());
    const dev = unwrap(await addProgram(h.container, DEV));
    expect(dev.status).toBe('active');
    expect((await classes(h, dev)).length).toBeGreaterThan(0);
  });
});

describe('lesson disclosures', () => {
  it('futures and penny-stock lessons carry their market’s risk disclosure; mixed-market modules do not', async () => {
    const { content } = (await createTestHarness()).container;
    const ids = (lessonId: string) => lessonDisclosures(content, lessonId).map((d) => d.id);
    const first = (moduleId: string) => content.module(moduleId)?.lessonIds[0] ?? '';
    expect(ids(first('futures'))).toEqual(['futures-risk']);
    expect(ids(first('penny-stocks'))).toEqual(['penny-stocks-risk']);
    expect(ids(first('stocks-basics'))).toEqual([]);
    expect(ids(first('ta-patterns'))).toEqual([]);
    expect(ids('missing')).toEqual([]);
  });
});
