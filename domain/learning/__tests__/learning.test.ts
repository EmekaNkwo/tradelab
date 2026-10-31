import type { Lesson, Question } from '../../models/content';
import { gradeQuestion, gradeQuestions } from '../assessment';
import { buildClassSections, resumeIndex } from '../classBuilder';
import { addDays, toLocalDate } from '../dates';
import { buildMissions, missionCompletion, recordMissionProgress } from '../missions';
import { catchUpOptions, rebuildSchedule, remainingUnits, timelineStatus } from '../progress';
import type { PlannedClass, ScheduleModule, ScheduleSettings } from '../scheduler';
import { bringForward, decodeReviewAnswer, dueItems, encodeReviewAnswer, isGenuinelyDue, newReviewItem, recordReview } from '../spacedRepetition';

const d = toLocalDate;

const question = (id: string, correct: string[] = ['a']): Question => ({
  id,
  prompt: 'Q',
  options: [
    { id: 'a', text: 'A', explanation: 'A because' },
    { id: 'b', text: 'B', explanation: 'B because' },
    { id: 'c', text: 'C', explanation: 'C because' },
  ],
  correctOptionIds: correct,
  level: 'beginner',
  glossaryIds: [],
});

describe('assessment', () => {
  it('gives feedback for the chosen option and the missed correct one', () => {
    const r = gradeQuestion(question('q'), ['b']);
    expect(r.correct).toBe(false);
    expect(r.feedback).toEqual(['B because', 'A because']);
    expect(gradeQuestion(question('q'), ['a', 'a']).correct).toBe(true);
  });

  it('requires exactly the correct set for multi-answer questions', () => {
    expect(gradeQuestion(question('q', ['a', 'c']), ['a']).correct).toBe(false);
    expect(gradeQuestion(question('q', ['a', 'c']), ['c', 'a']).correct).toBe(true);
  });

  it('applies the pass mark (80% for checkpoints)', () => {
    const qs = ['1', '2', '3', '4', '5'].map((id) => question(id));
    const answers = { 1: ['a'], 2: ['a'], 3: ['a'], 4: ['a'], 5: ['b'] };
    expect(gradeQuestions(qs, answers, 0.8)).toMatchObject({ score: 0.8, passed: true, correctCount: 4 });
    expect(gradeQuestions(qs, { ...answers, 4: ['b'] }, 0.8).passed).toBe(false);
    expect(gradeQuestions([], {}, 0.8).passed).toBe(false);
  });
});

describe('spaced repetition', () => {
  it('brings concepts forward to today without losing their box, and adds missing ones', () => {
    const today = toLocalDate('2026-10-29');
    const later = { conceptId: 'a', box: 4, dueDate: toLocalDate('2026-11-05'), lapses: 2 };
    const due = { conceptId: 'b', box: 2, dueDate: toLocalDate('2026-10-28'), lapses: 0 };
    expect(bringForward([later, due], ['a', 'b', 'c', 'a'], today)).toEqual([
      { ...later, dueDate: today, earlyFrom: toLocalDate('2026-11-05') },
      { conceptId: 'c', box: 1, dueDate: today, lapses: 0, earlyFrom: toLocalDate('2026-10-30') },
    ]);
  });

  const today = d('2026-11-02');
  it('moves up on success, resets on a miss, and schedules by box', () => {
    const item = newReviewItem('q1', today);
    expect(item.dueDate).toBe('2026-11-03');
    const up = recordReview(item, true, item.dueDate);
    expect(up).toMatchObject({ box: 2, dueDate: '2026-11-05' });
    const down = recordReview(up, false, today);
    expect(down).toMatchObject({ box: 1, lapses: 1, dueDate: '2026-11-03' });
    let top = item;
    for (let i = 0; i < 10; i += 1) top = recordReview(top, true, top.dueDate);
    expect(top.box).toBe(6);
  });

  it('never promotes a review done before its real schedule (brought forward or early), however often', () => {
    const item = { conceptId: 'q', box: 3, dueDate: d('2026-11-06'), lapses: 1 };
    const [forward] = bringForward([item], ['q'], today);
    expect(forward && isGenuinelyDue(forward, today)).toBe(false);
    let looped = forward!;
    for (let i = 0; i < 50; i += 1) {
      looped = recordReview(looped, true, today);
      looped = bringForward([looped], ['q'], today)[0] ?? looped;
    }
    expect(looped).toMatchObject({ box: 3, lapses: 1 });
    // Answered right early: back to its original schedule, not moved up.
    expect(recordReview(forward!, true, today)).toEqual({ ...item, earlyFrom: null });
    // Answered wrong early: a real lapse.
    expect(recordReview(forward!, false, today)).toMatchObject({ box: 1, lapses: 2, dueDate: addDays(today, 1) });
    // On the real due date it moves up as usual.
    expect(recordReview(item, true, item.dueDate)).toMatchObject({ box: 4 });
  });

  it('stores whether a re-test was genuinely due with its answer', () => {
    expect(decodeReviewAnswer(encodeReviewAnswer(true, true))).toEqual({ correct: true, genuinelyDue: true });
    expect(decodeReviewAnswer(encodeReviewAnswer(false, false))).toEqual({ correct: false, genuinelyDue: false });
    // Answers stored before this change ("correct" alone) count as due.
    expect(decodeReviewAnswer(['correct'])).toEqual({ correct: true, genuinelyDue: true });
  });

  it('returns due items, most overdue and most-missed first', () => {
    const items = [
      { conceptId: 'x', box: 1, dueDate: d('2026-11-02'), lapses: 0 },
      { conceptId: 'y', box: 1, dueDate: d('2026-11-01'), lapses: 0 },
      { conceptId: 'z', box: 1, dueDate: d('2026-11-02'), lapses: 3 },
      { conceptId: 'later', box: 1, dueDate: d('2026-11-05'), lapses: 9 },
    ];
    expect(dueItems(items, today, 10).map((i) => i.conceptId)).toEqual(['y', 'z', 'x']);
    expect(dueItems(items, today, 1)).toHaveLength(1);
  });
});

const lesson = (id: string, homework?: string): Lesson => ({
  id,
  moduleId: 'm',
  title: id,
  level: 'beginner',
  estimatedMinutes: 15,
  inOneLine: { simple: 'x' },
  explain: { simple: 'x' },
  realNumbers: { assumptions: ['a'], steps: ['s'] },
  anotherExample: { assumptions: ['a'], steps: ['s'] },
  explainSimpler: 'x',
  commonMistake: 'x',
  quickCheck: [question(`${id}-q1`), question(`${id}-q2`)],
  doItNow: { kind: 'calculator', instructions: 'do' },
  ...(homework ? { homework } : {}),
  glossaryIds: [],
  sourceIds: [],
});

const planned = (over: Partial<PlannedClass>): PlannedClass => ({
  index: 0,
  date: d('2026-11-02'),
  kind: 'lesson',
  moduleId: 'm',
  unitIds: ['m:l1'],
  minutes: 15,
  ...over,
});

describe('classBuilder', () => {
  it('short classes: learn, one task, quiz, summary (no worked example)', () => {
    const sections = buildClassSections({ plannedClass: planned({}), lessons: [lesson('l1')], dueQuestionIds: [], checkpointQuizIds: [] });
    expect(sections.map((s) => s.kind)).toEqual(['learn', 'practise', 'quiz', 'summary']);
  });

  it('longer classes add warm-up review, the worked example, and homework', () => {
    const sections = buildClassSections({
      plannedClass: planned({ minutes: 45 }),
      lessons: [lesson('l1', 'Check the spread'), lesson('l2')],
      dueQuestionIds: ['old-1', 'old-2', 'old-3', 'old-4'],
      checkpointQuizIds: [],
    });
    expect(sections.map((s) => s.kind)).toEqual(['warmup', 'learn', 'watch', 'practise', 'learn', 'watch', 'practise', 'quiz', 'homework', 'summary']);
    expect(sections[0]).toMatchObject({ questionIds: ['old-1', 'old-2', 'old-3'] });
  });

  it('builds checkpoint and review classes', () => {
    expect(
      buildClassSections({ plannedClass: planned({ kind: 'checkpoint' }), lessons: [], dueQuestionIds: [], checkpointQuizIds: ['m-check'] }).map((s) => s.kind),
    ).toEqual(['checkpoint', 'summary']);
    const review = buildClassSections({ plannedClass: planned({ kind: 'review', minutes: 20 }), lessons: [], dueQuestionIds: Array.from({ length: 20 }, (_, i) => `q${i}`), checkpointQuizIds: [] });
    expect(review[0]).toMatchObject({ kind: 'warmup' });
    const warm = review[0];
    expect(warm?.kind === 'warmup' && warm.questionIds).toHaveLength(10);
  });

  it('resumes at the first unfinished section', () => {
    expect(resumeIndex(['a', 'b', 'c'].map(() => ({ kind: 'summary', minutes: 1 }) as const), 2)).toBe(2);
    expect(resumeIndex([{ kind: 'summary', minutes: 1 }], 9)).toBe(0);
  });
});

describe('progress', () => {
  const mods: ScheduleModule[] = [{ id: 'm', title: 'm', lessonIds: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'], checkpointQuizId: 'c', minPracticeDays: 0 }];
  const settings: ScheduleSettings = { startDate: d('2026-11-02'), timeline: { kind: 'weeks', weeks: 1 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 };

  it('reports behind / ahead / on track', () => {
    const classes = [
      { date: d('2026-11-02'), status: 'completed' as const, unitIds: [] },
      { date: d('2026-11-03'), status: 'planned' as const, unitIds: [] },
      { date: d('2026-11-05'), status: 'planned' as const, unitIds: [] },
    ];
    expect(timelineStatus(classes, d('2026-11-04'))).toEqual({ kind: 'behind', classesBehind: 1 });
    expect(timelineStatus(classes, d('2026-11-03'))).toEqual({ kind: 'on_track' });
    expect(timelineStatus([{ date: d('2026-11-09'), status: 'completed', unitIds: [] }], d('2026-11-03'))).toEqual({ kind: 'ahead', classesAhead: 1 });
  });

  it('offers extend, catch-up, and lengthen choices without piling classes onto one day', () => {
    const done = new Set(['m:l1']);
    const options = catchUpOptions(mods, settings, done, d('2026-11-05'));
    expect(options.map((o) => o.choice)).toEqual(['extend_finish_date', 'add_catch_up_class', 'lengthen_classes']);
    for (const o of options) {
      const dates = o.plan.classes.map((c) => c.date);
      expect(new Set(dates).size).toBe(dates.length);
      expect(o.plan.classes.flatMap((c) => c.unitIds)).not.toContain('m:l1');
    }
    const lengthen = options[2]!;
    expect(lengthen.settings.dailyMinutes).toBeGreaterThan(15);
    expect(lengthen.plan.warnings.some((w) => w.kind === 'too_tight')).toBe(false);
  });

  it('rebuilds from today keeping completed units', () => {
    const plan = rebuildSchedule(mods, { ...settings, timeline: { kind: 'open' } }, new Set(['m:l1', 'm:l2']), d('2026-11-04'));
    expect(plan.classes[0]?.date).toBe('2026-11-04');
    expect(plan.classes.flatMap((c) => c.unitIds)).not.toContain('m:l2');
    expect(remainingUnits(mods, new Set(['m:l1'])).has('m:l1')).toBe(false);
  });
});

describe('missions', () => {
  const activities = [
    { kind: 'review_concepts', title: 'Review 3 concepts', minutes: 5, target: 3, priority: 2 },
    { kind: 'complete_class', title: 'Complete the class', minutes: 15, target: 1, priority: 0 },
    { kind: 'glossary', title: 'Learn 2 terms', minutes: 5, target: 2, priority: 3 },
    { kind: 'long', title: 'Long thing', minutes: 60, target: 1, priority: 1 },
  ];
  it('always includes the class and fills the remaining time in priority order', () => {
    const list = buildMissions('Forex basics', 25, activities);
    expect(list.missions.map((m) => m.kind)).toEqual(['complete_class', 'review_concepts', 'glossary']);
    expect(list.totalMinutes).toBe(25);
  });

  it('tracks progress immutably', () => {
    const list = buildMissions('F', 25, activities);
    const after = recordMissionProgress(recordMissionProgress(list, 'complete_class'), 'review_concepts', 5);
    expect(missionCompletion(after)).toEqual({ done: 2, total: 3 });
    expect(missionCompletion(list)).toEqual({ done: 0, total: 3 });
  });
});
