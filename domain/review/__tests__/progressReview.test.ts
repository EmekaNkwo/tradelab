import type { Module, Question } from '../../models/content';
import type { JournalEntry } from '../../models/journal';
import type { QuizAttempt } from '../../models/learning';
import type { DrillAttempt } from '../../models/practice';
import { progressReview, PROGRESS_REVIEW_REMINDER, type ProgressReviewInput } from '..';

const mod = (id: string, lessonIds: string[]): Module => ({
  id,
  title: id,
  summary: '',
  markets: ['forex'],
  level: 'beginner',
  lessonIds,
  checkpointQuizId: `${id}-checkpoint`,
  practicalResult: `do ${id}`,
  minPracticeDays: 0,
  skills: ['market_fundamentals'],
});
const q = (id: string, correct: string): Question => ({ id, prompt: id, options: [], correctOptionIds: [correct], level: 'beginner', glossaryIds: [] });
const attempt = (kind: QuizAttempt['kind'], refId: string, answers: Record<string, string[]>, passed = false, score = 0.5, createdAt = '2026-10-29T10:00:00.000Z'): QuizAttempt =>
  ({ id: `${refId}-${createdAt}`, kind, refId, answers, score, passed, createdAt }) as unknown as QuizAttempt;
const entry = (o: Partial<JournalEntry>): JournalEntry => ({ source: 'paper', ruleViolations: [], stop: '1', review: null, pnlMoney: '-50', ...o }) as JournalEntry;

const BASE: ProgressReviewInput = {
  modules: [mod('forex-pips-lots-leverage', ['fx-pip-value']), mod('forex-risk', ['fx-position-sizing']), mod('forex-orders', ['fx-sl-tp'])],
  moduleTasks: { 'forex-orders': ['mt-demo-trade-sl-tp'] },
  lessonModule: { 'fx-pip-value': 'forex-pips-lots-leverage', 'fx-position-sizing': 'forex-risk', 'fx-sl-tp': 'forex-orders' },
  questions: new Map([
    ['pv-q1', q('pv-q1', 'a')],
    ['pv-q2', q('pv-q2', 'b')],
    ['risk-q1', q('risk-q1', 'a')],
  ]),
  quizAttempts: [],
  drillAttempts: [],
  completedTaskIds: new Set(),
  practisedKinds: [],
  journal: [],
};

describe('Practice Progress Review', () => {
  it('starts empty, lists every gap in practice conditions, and always ends with the reminder', () => {
    const r = progressReview(BASE);
    expect(r.objectives.map((o) => o.checkpoint)).toEqual(['not_attempted', 'not_attempted', 'not_attempted']);
    expect(r.objectives.map((o) => o.practicalDone)).toEqual([null, null, false]);
    expect(r.calculations.every((c) => c.accuracy === null)).toBe(true);
    expect(r.gaps).toHaveLength(7);
    expect(r.reminder).toBe(PROGRESS_REVIEW_REMINDER);
    // No verdict field of any kind: the review describes, it does not pass or fail the learner.
    expect(Object.keys(r).sort()).toEqual(['calculations', 'conditions', 'gaps', 'objectives', 'reminder', 'rules']);
  });

  it('marks checkpoints and practical tasks, and calculation accuracy from the latest quick-check answers', () => {
    const r = progressReview({
      ...BASE,
      quizAttempts: [
        attempt('checkpoint', 'forex-pips-lots-leverage-checkpoint', { 'pv-q1': ['a'], 'pv-q2': ['a'] }, false, 0.5),
        attempt('checkpoint', 'forex-pips-lots-leverage-checkpoint', { 'pv-q1': ['a'], 'pv-q2': ['b'] }, true, 1),
        // An early mistake on pv-q2 is replaced by the later right answer; pv-q1 stays wrong.
        attempt('lesson_check', 'fx-pip-value', { 'pv-q1': ['b'], 'pv-q2': ['a'] }, false, 0, '2026-10-28T10:00:00.000Z'),
        attempt('lesson_check', 'fx-pip-value', { 'pv-q2': ['b', 'b'] }, true, 1, '2026-10-29T12:00:00.000Z'),
        attempt('lesson_check', 'fx-position-sizing', { 'risk-q1': ['b'], 'unknown-q': ['a'] }),
      ],
      drillAttempts: [{ kind: 'size_it', correct: true }, { kind: 'size_it', correct: false }, { kind: 'find_the_trend', correct: false }] as DrillAttempt[],
      completedTaskIds: new Set(['mt-demo-trade-sl-tp']),
    });
    expect(r.objectives[0]).toMatchObject({ checkpoint: 'passed', bestScore: 1 });
    expect(r.objectives[2]!.practicalDone).toBe(true);
    expect(r.calculations.map((c) => [c.id, c.correct, c.answered])).toEqual([
      ['pips_margin', 1, 2],
      ['risk_sizing', 0, 1],
      ['size_it_drill', 1, 2],
    ]);
    expect(r.gaps.find((g) => g.reason.startsWith('Pips'))).toMatchObject({ reason: 'Pips, lots, pip value and margin: 1 of 2 correct', lessonIds: ['fx-pip-value'], drillKind: null });
    expect(r.gaps.find((g) => g.reason.startsWith('Position size'))).toMatchObject({ lessonIds: ['fx-position-sizing'], drillKind: 'size_it' });
  });

  it('measures rule-following on checked trades only, never using results', () => {
    const journal = [
      entry({ ruleViolations: ['no_stop'], stop: null }),
      entry({ ruleViolations: ['no_stop'], stop: null, source: 'manual' }),
      entry({ review: {} as never, pnlMoney: '500' }),
      entry({ source: 'mt_import', ruleViolations: [] }),
    ];
    const r = progressReview({ ...BASE, journal });
    expect(r.rules).toEqual({ checkedTrades: 3, withoutBreaks: 1, withStop: 1, reviewed: 1, commonBreaks: [{ rule: 'no_stop', count: 2 }] });
    expect(r.gaps.map((g) => g.reason)).toContain('A rule you break often: No stop loss (2 times)');
    // Same review whatever the money result was.
    const richer = progressReview({ ...BASE, journal: journal.map((e) => ({ ...e, pnlMoney: '99999' })) });
    expect(richer).toEqual(r);
  });

  it('counts practice per market condition from replays and paper accounts', () => {
    const r = progressReview({ ...BASE, practisedKinds: ['range', 'sideways', 'crash', 'news_shock'] });
    expect(Object.fromEntries(r.conditions.map((c) => [c.id, c.sessions]))).toEqual({ trending: 0, ranging: 2, breakouts: 0, reversals: 1, high_volatility: 1, low_volatility: 0, news: 1 });
  });
});
