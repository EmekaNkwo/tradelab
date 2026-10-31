import { gradeQuestions, gradeQuiz, toLocalDate, type Answers } from '../../../domain/learning';
import type { Question } from '../../../domain/models/content';
import { createTestHarness, movableClock, type TestHarness } from '../../../testing/harness';
import type { UtcIso } from '../../../shared/time';
import { previewProgram, todaysClass } from '../plan';
import {
  catchUpChoices,
  completeOnboarding,
  dueQuestionIds,
  ensureTodaysMissions,
  finishClass,
  finishReview,
  pauseProgram,
  reminderPlanFor,
  rescheduleProgram,
  resumeProgram,
  updateClassTime,
  type OnboardingInput,
} from '../useCases';

const PROGRAM = 'practical-forex-trader';
// 2026-10-29 is a Thursday; Lagos is UTC+1.
const START = toLocalDate('2026-10-29');

const onboarding = (over: Partial<OnboardingInput> = {}): OnboardingInput => ({
  riskAcknowledged: true,
  experience: 'complete_beginner',
  markets: ['forex'],
  goals: ['understand_markets'],
  explanationLevel: 'simple',
  metaTrader: { version: 'mt5', installed: false },
  timeZone: 'Africa/Lagos',
  programId: PROGRAM,
  settings: { startDate: START, timeline: { kind: 'weeks', weeks: 2 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
  classTime: '19:30',
  remindersEnabled: true,
  placementPassedModuleIds: [],
  ...over,
});

const correctAnswers = (questions: readonly Question[]): Answers => Object.fromEntries(questions.map((q) => [q.id, q.correctOptionIds]));
const wrongAnswers = (questions: readonly Question[]): Answers =>
  Object.fromEntries(questions.map((q) => [q.id, [q.options.find((o) => !q.correctOptionIds.includes(o.id))!.id]]));

async function setup(clock = movableClock()) {
  const h = await createTestHarness(undefined, clock);
  const enrolled = await completeOnboarding(h.container, onboarding());
  if (!enrolled.ok) throw new Error(enrolled.error.message);
  return { h, clock, enrolment: enrolled.value };
}

async function classesOf(h: TestHarness, enrolmentId: string) {
  const r = await h.container.learning.classes(enrolmentId);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('learning flow', () => {
  it('onboarding saves the profile, settings, enrolment, schedule, and reminders', async () => {
    const { h, enrolment } = await setup();
    const profile = await h.container.profile.get();
    expect(profile.ok && profile.value).toMatchObject({ experience: 'complete_beginner', riskAcknowledgedAt: '2026-10-29T10:00:00.000Z' });
    expect(enrolment).toMatchObject({ programId: PROGRAM, status: 'active', classTime: '19:30' });
    const classes = await classesOf(h, enrolment.id);
    // Module 1: 4 lessons + checkpoint, with a review class every 5th class; the other modules follow in program order.
    expect(classes.slice(0, 6).map((c) => c.kind)).toEqual(['lesson', 'lesson', 'lesson', 'lesson', 'review', 'checkpoint']);
    const units = classes.flatMap((c) => c.unitIds);
    expect(new Set(units).size).toBe(units.length);
    expect(units.filter((u) => u.endsWith(':checkpoint'))).toEqual(['forex-basics', 'forex-pips-lots-leverage', 'forex-orders', 'forex-charts', 'forex-levels', 'forex-indicators', 'forex-risk', 'forex-fundamentals', 'forex-rules-based-strategies', 'forex-my-plan', 'forex-backtest-plan', 'forex-forward-test', 'forex-scams-brokers'].map((m) => `${m}:checkpoint`));
    expect(classes[0]?.date).toBe('2026-10-29');
    expect(h.reminders.latest()?.slots).toHaveLength(5);
  });

  it('refuses onboarding without the simulation-only agreement', async () => {
    const h = await createTestHarness();
    const r = await completeOnboarding(h.container, onboarding({ riskAcknowledged: false }));
    expect(!r.ok && r.error.kind).toBe('ValidationError');
    const profile = await h.container.profile.get();
    expect(profile.ok && profile.value).toBeNull();
  });

  it('placement skips modules already passed', async () => {
    const h = await createTestHarness();
    const r = await completeOnboarding(h.container, onboarding({ placementPassedModuleIds: ['forex-basics'] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const classes = await classesOf(h, r.value.id);
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.some((c) => c.moduleId === 'forex-basics')).toBe(false);
    const done = await h.container.learning.completedUnitIds(r.value.id);
    expect(done.ok && done.value.size).toBe(5);
  });

  it('saves placement answers as placement attempts, passed or not', async () => {
    const h = await createTestHarness();
    const basics = h.container.content.quiz('forex-basics-checkpoint')!;
    const pips = h.container.content.quiz('forex-pips-lots-leverage-checkpoint')!;
    const pass = correctAnswers(basics.questions);
    const fail = wrongAnswers(pips.questions);
    const r = await completeOnboarding(
      h.container,
      onboarding({
        placementPassedModuleIds: ['forex-basics'],
        placementAttempts: [
          { quizId: basics.id, answers: pass, score: gradeQuiz(basics, pass).score, passed: true },
          { quizId: pips.id, answers: fail, score: gradeQuiz(pips, fail).score, passed: false },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    const attempts = await h.container.learning.quizAttempts();
    expect(attempts.ok && attempts.value.map((a) => [a.kind, a.refId, a.passed]).sort()).toEqual([
      ['placement', basics.id, true],
      ['placement', pips.id, false],
    ]);
  });

  it('saves warm-ups as review attempts, marking ones that were not genuinely due, and resyncs reminders', async () => {
    const { h, enrolment } = await setup();
    const cls = todaysClass(await classesOf(h, enrolment.id), START)!;
    // q-due was due yesterday; q-early is brought forward from next week.
    await h.container.learning.saveReviewItems(
      [
        { conceptId: 'fx-position-sizing-q1', box: 2, dueDate: toLocalDate('2026-10-28'), lapses: 0 },
        { conceptId: 'fx-position-sizing-q2', box: 3, dueDate: START, lapses: 0, earlyFrom: toLocalDate('2026-11-04') },
      ],
      '2026-10-29T10:00:00.000Z' as UtcIso,
    );
    const syncs = h.reminders.synced.length;
    const outcome = await finishClass(h.container, cls, {
      warmup: [
        { questionId: 'fx-position-sizing-q1', correct: true },
        { questionId: 'fx-position-sizing-q2', correct: true },
      ],
      lessonChecks: [],
      checkpoint: null,
    });
    expect(outcome.ok).toBe(true);
    const attempts = await h.container.learning.quizAttempts();
    const review = attempts.ok ? attempts.value.find((a) => a.kind === 'review') : undefined;
    expect(review?.answers).toEqual({ 'fx-position-sizing-q1': ['correct'], 'fx-position-sizing-q2': ['correct', 'early'] });
    const items = await h.container.learning.reviewItems();
    const byId = new Map((items.ok ? items.value : []).map((i) => [i.conceptId, i]));
    // Due: moved up a box. Brought forward: back to its real date, same box.
    expect(byId.get('fx-position-sizing-q1')).toMatchObject({ box: 3 });
    expect(byId.get('fx-position-sizing-q2')).toMatchObject({ box: 3, dueDate: '2026-11-04', earlyFrom: null });
    expect(h.reminders.synced.length).toBe(syncs + 1);
    expect(h.reminders.options.at(-1)).toEqual({ prompt: false });
  });

  it('a lesson class completes units only when the quick check is mastered, and feeds spaced repetition', async () => {
    const { h, clock, enrolment } = await setup();
    const cls = todaysClass(await classesOf(h, enrolment.id), START)!;
    const lesson = h.container.content.lesson(cls.unitIds[0]!.split(':')[1]!)!;
    await h.container.learning.startClass(cls.id, '2026-10-29T10:05:00.000Z' as UtcIso);
    await h.container.learning.saveSectionProgress(cls.id, 2);
    expect((await h.container.learning.getClass(cls.id)).ok).toBe(true);

    const first = wrongAnswers(lesson.quickCheck);
    const outcome = await finishClass(h.container, cls, {
      warmup: [],
      lessonChecks: [{ lessonId: lesson.id, firstAttempt: first, firstResult: gradeQuestions(lesson.quickCheck, first, 1), mastered: true }],
      checkpoint: null,
    });
    expect(outcome).toMatchObject({ ok: true, value: { finished: true, score: 0, unitsCompleted: [cls.unitIds[0]] } });
    const saved = await h.container.learning.getClass(cls.id);
    expect(saved.ok && saved.value).toMatchObject({ status: 'completed', score: 0, sectionsDone: 2 });

    // Missed questions come back for review the next day.
    clock.set('2026-10-30T10:00:00.000Z');
    const due = await dueQuestionIds(h.container, 10);
    expect(due.ok && due.value).toEqual(lesson.quickCheck.map((q) => q.id));
    await finishReview(h.container, lesson.quickCheck.map((q) => ({ questionId: q.id, correct: true })));
    const after = await dueQuestionIds(h.container, 10);
    expect(after.ok && after.value).toEqual([]);
  });

  it('a failed checkpoint keeps the class open and the unit incomplete; passing completes it', async () => {
    const { h, enrolment } = await setup();
    const checkpointClass = (await classesOf(h, enrolment.id)).find((c) => c.kind === 'checkpoint')!;
    const quiz = h.container.content.quiz('forex-basics-checkpoint')!;
    const fail = wrongAnswers(quiz.questions);
    const failed = await finishClass(h.container, checkpointClass, { warmup: [], lessonChecks: [], checkpoint: { quizId: quiz.id, answers: fail, result: gradeQuiz(quiz, fail) } });
    expect(failed.ok && failed.value.finished).toBe(false);
    const open = await h.container.learning.getClass(checkpointClass.id);
    expect(open.ok && open.value.status).toBe('planned');

    const pass = correctAnswers(quiz.questions);
    const passed = await finishClass(h.container, checkpointClass, { warmup: [], lessonChecks: [], checkpoint: { quizId: quiz.id, answers: pass, result: gradeQuiz(quiz, pass) } });
    expect(passed.ok && passed.value).toMatchObject({ finished: true, unitsCompleted: ['forex-basics:checkpoint'] });
  });

  it('falling behind offers catch-up choices, and rescheduling keeps completed work', async () => {
    const { h, clock, enrolment } = await setup();
    const first = (await classesOf(h, enrolment.id))[0]!;
    const lesson = h.container.content.lesson(first.unitIds[0]!.split(':')[1]!)!;
    const answers = correctAnswers(lesson.quickCheck);
    await finishClass(h.container, first, {
      warmup: [],
      lessonChecks: [{ lessonId: lesson.id, firstAttempt: answers, firstResult: gradeQuestions(lesson.quickCheck, answers, 1), mastered: true }],
      checkpoint: null,
    });

    clock.set('2026-11-04T10:00:00.000Z'); // Wednesday: Fri, Mon, Tue missed
    const choices = await catchUpChoices(h.container, enrolment);
    expect(choices.ok && choices.value.map((c) => c.choice)).toEqual(expect.arrayContaining(['extend_finish_date', 'add_catch_up_class']));
    const extend = choices.ok ? choices.value.find((c) => c.choice === 'extend_finish_date')! : null;
    const r = await rescheduleProgram(h.container, enrolment, extend!.settings);
    expect(r.ok).toBe(true);
    const classes = await classesOf(h, enrolment.id);
    expect(classes[0]).toMatchObject({ id: first.id, status: 'completed' });
    const planned = classes.filter((c) => c.status === 'planned');
    expect(planned.every((c) => c.date >= '2026-11-04')).toBe(true);
    expect(planned.flatMap((c) => c.unitIds)).not.toContain(first.unitIds[0]);
    expect(new Set(planned.map((c) => c.date)).size).toBe(planned.length);
  });

  it('pause clears reminders; resume rebuilds from today', async () => {
    const { h, clock, enrolment } = await setup();
    const paused = await pauseProgram(h.container, enrolment);
    expect(paused.ok && paused.value.status).toBe('paused');
    expect(h.reminders.latest()).toBeNull();
    clock.set('2026-11-09T10:00:00.000Z');
    const resumed = await resumeProgram(h.container, paused.ok ? paused.value : enrolment);
    expect(resumed.ok && resumed.value.status).toBe('active');
    const planned = (await classesOf(h, enrolment.id)).filter((c) => c.status === 'planned');
    expect(planned[0]?.date).toBe('2026-11-09');
    expect(h.reminders.latest()?.slots).toHaveLength(5);
  });

  it('class time and reminders can be changed or turned off', async () => {
    const { h, enrolment } = await setup();
    const off = await updateClassTime(h.container, enrolment, '07:00', false);
    expect(off.ok && off.value).toMatchObject({ enrolment: { classTime: '07:00', remindersEnabled: false }, reminders: 'cleared' });
    h.reminders.outcome = 'permission_denied';
    const on = await updateClassTime(h.container, enrolment, '07:00', true);
    expect(on.ok && on.value.reminders).toBe('permission_denied');
    expect(reminderPlanFor({ ...enrolment, classTime: '07:05' })?.slots[0]).toEqual({ weekday: 1, hour: 7, minute: 5 });
    expect((await updateClassTime(h.container, enrolment, '25:00', true)).ok).toBe(false);
  });

  it('a second program is queued, not activated', async () => {
    const { h } = await setup();
    const second = await h.container.learning.enrol(
      { programId: PROGRAM, settings: onboarding().settings, classTime: null, remindersEnabled: false, plan: [], completedUnitIds: [] },
      '2026-10-29T11:00:00.000Z' as UtcIso,
    );
    expect(second.ok && second.value).toMatchObject({ status: 'queued', queuePosition: 1 });
  });

  it("builds today's missions once and tracks progress", async () => {
    const { h, enrolment } = await setup();
    await ensureTodaysMissions(h.container, enrolment);
    await ensureTodaysMissions(h.container, enrolment);
    const list = await h.container.missions.forDate(START);
    expect(list.ok && list.value?.missions.map((m) => m.kind)).toEqual(['complete_class', 'class_note']);
    const cls = todaysClass(await classesOf(h, enrolment.id), START)!;
    const lesson = h.container.content.lesson(cls.unitIds[0]!.split(':')[1]!)!;
    const a = correctAnswers(lesson.quickCheck);
    await finishClass(h.container, cls, { warmup: [], lessonChecks: [{ lessonId: lesson.id, firstAttempt: a, firstResult: gradeQuestions(lesson.quickCheck, a, 1), mastered: true }], checkpoint: null });
    const after = await h.container.missions.forDate(START);
    expect(after.ok && after.value?.missions[0]?.progress).toBe(1);
  });

  it('notes are validated and saved', async () => {
    const { h, enrolment } = await setup();
    const cls = (await classesOf(h, enrolment.id))[0]!;
    expect((await h.container.learning.addNote(cls.id, '   ', '2026-10-29T10:00:00.000Z' as UtcIso)).ok).toBe(false);
    await h.container.learning.addNote(cls.id, 'Spread = ask − bid', '2026-10-29T10:00:00.000Z' as UtcIso);
    const notes = await h.container.learning.notes(cls.id);
    expect(notes.ok && notes.value.map((n) => n.body)).toEqual(['Spread = ask − bid']);
  });

  describe('code review regressions (Phase 2)', () => {
    const masteredCheck = (lessonId: string, h: TestHarness, correct = true) => {
      const lesson = h.container.content.lesson(lessonId)!;
      const a = correct ? correctAnswers(lesson.quickCheck) : wrongAnswers(lesson.quickCheck);
      return { lessonId, firstAttempt: a, firstResult: gradeQuestions(lesson.quickCheck, a, 1), mastered: correct };
    };

    it('catch-up and reschedule keep a weeks timeline anchored to the program start', async () => {
      const { h, clock, enrolment } = await setup();
      // 2-week plan from Thu 29 Oct ends Wed 11 Nov. Missed everything until Mon 9 Nov.
      clock.set('2026-11-09T10:00:00.000Z');
      const choices = await catchUpChoices(h.container, enrolment);
      if (!choices.ok) throw new Error(choices.error.message);
      const catchUp = choices.value.find((c) => c.choice === 'add_catch_up_class')!;
      expect(catchUp.settings.timeline).toEqual({ kind: 'finishDate', date: '2026-11-11' });
      expect(catchUp.plan.warnings.map((w) => w.kind)).toContain('too_tight');
      // Three modules cannot fit into the last three days at any class length, so lengthening is not offered.
      expect(choices.value.find((c) => c.choice === 'lengthen_classes')).toBeUndefined();

      await rescheduleProgram(h.container, enrolment, enrolment.settings);
      const e = await h.container.learning.currentEnrolment();
      expect(e.ok && e.value?.settings.timeline).toEqual({ kind: 'finishDate', date: '2026-11-11' });
    });

    it('saving a class twice records it once', async () => {
      const { h, enrolment } = await setup();
      const cls = (await classesOf(h, enrolment.id))[0]!;
      const results = { warmup: [], lessonChecks: [masteredCheck('fx-currency-pairs', h)], checkpoint: null };
      await finishClass(h.container, cls, results);
      const again = await finishClass(h.container, cls, results);
      expect(again.ok && again.value.unitsCompleted).toEqual([]);
      expect(await h.db.getAllAsync('SELECT * FROM quiz_attempt', [])).toHaveLength(1);
      const missions = await h.container.missions.forDate(START);
      expect(missions.ok).toBe(true);
    });

    it('a lesson class whose quiz was not mastered stays open, so no unit is orphaned', async () => {
      const { h, enrolment } = await setup();
      const cls = (await classesOf(h, enrolment.id))[0]!;
      const r = await finishClass(h.container, cls, { warmup: [], lessonChecks: [masteredCheck('fx-currency-pairs', h, false)], checkpoint: null });
      expect(r.ok && r.value.finished).toBe(false);
      const saved = await h.container.learning.getClass(cls.id);
      expect(saved.ok && saved.value.status).not.toBe('completed');
    });

    it("rescheduling after today's class is done starts tomorrow; starting early still allows today", async () => {
      const { h, enrolment } = await setup();
      const cls = (await classesOf(h, enrolment.id))[0]!;
      await finishClass(h.container, cls, { warmup: [], lessonChecks: [masteredCheck('fx-currency-pairs', h)], checkpoint: null });
      await rescheduleProgram(h.container, enrolment, { ...enrolment.settings, dailyMinutes: 30 });
      const planned = (await classesOf(h, enrolment.id)).filter((c) => c.status === 'planned');
      expect(planned.every((c) => c.date > START)).toBe(true);
      await rescheduleProgram(h.container, enrolment, { ...enrolment.settings, extraDates: [START] }, { allowAnotherToday: true });
      expect((await classesOf(h, enrolment.id)).filter((c) => c.status === 'planned')[0]?.date).toBe(START);
    });

    it('resuming pushes the finish date back by the length of the pause', async () => {
      const { h, clock, enrolment } = await setup();
      const paused = await pauseProgram(h.container, enrolment);
      clock.set('2026-11-05T10:00:00.000Z'); // paused 7 days
      const resumed = await resumeProgram(h.container, paused.ok ? paused.value : enrolment);
      expect(resumed.ok && resumed.value.settings.timeline).toEqual({ kind: 'finishDate', date: '2026-11-18' });
    });

    it('rejects an invalid time zone at onboarding', async () => {
      const h = await createTestHarness();
      const r = await completeOnboarding(h.container, onboarding({ timeZone: 'Mars/Olympus' }));
      expect(!r.ok && r.error.kind).toBe('ValidationError');
    });
  });

  it('previews are deterministic and warn when the plan is too tight', () => {
    return createTestHarness().then((h) => {
      const tight = previewProgram(h.container.content, PROGRAM, { ...onboarding().settings, timeline: { kind: 'finishDate', date: START }, studyDays: [4] });
      expect(tight.warnings[0]?.kind).toBe('too_tight');
      expect(tight.suggestions.length).toBeGreaterThan(0);
    });
  });
});
