import type { ContentRepository } from '../../../data';
import { shippedContent } from '../../../testing/strategyFixtures';
import { toLocalDate } from '../../../domain/learning/dates';
import type { JournalEntry } from '../../../domain/models/journal';
import type { LabAttempt } from '../../../domain/models/labs';
import type { DailyClass, QuizAttempt } from '../../../domain/models/learning';
import { allSkillMastery, awards, skillMastery } from '../../../domain/progress';
import { buildDashboard, weekStart, type DashboardInput } from '../dashboard';
import { checkedTrade, progressFacts, substantialReview, type ProgressActivity } from '../progressFacts';
import { dashboardContent } from '../useProgress';

const content: ContentRepository = shippedContent();

const T = '2026-10-29T10:00:00.000Z';
const quiz = (kind: QuizAttempt['kind'], refId: string, answers: Record<string, string[]>, passed: boolean, createdAt = T): QuizAttempt =>
  ({ id: `${kind}-${refId}-${createdAt}`, kind, refId, answers, score: passed ? 1 : 0, passed, createdAt }) as unknown as QuizAttempt;
const trade = (o: Partial<JournalEntry> = {}): JournalEntry =>
  ({
    id: Math.random().toString(36),
    source: 'paper',
    stop: '1.0950',
    size: '10000',
    pnlMoney: '-50',
    pnlR: '-1',
    equityAtEntry: '10000',
    entryRationale: 'Pullback to support after a higher low',
    emotion: null,
    ruleViolations: [],
    review: null,
    closedAt: T,
    createdAt: T,
    ...o,
  }) as JournalEntry;

const EMPTY: ProgressActivity = {
  quizAttempts: [],
  drillAttempts: [],
  labAttempts: [],
  replays: [],
  journal: [],
  psych: [],
  backtests: [],
  completedMtTaskIds: new Set(),
  classes: [],
  completedUnitIds: new Set(),
  programId: null,
  timeZone: 'Africa/Lagos',
  riskLimitPercent: 1,
};

const NO_UNLOCKS = new Map<string, string>();
const dashboardInput = (o: Omit<DashboardInput, 'unlocked'>): DashboardInput => ({ ...o, unlocked: NO_UNLOCKS });
/** A wrong option for a shipped question. */
const wrong = (questionId: string): string[] => {
  const q = content.question(questionId);
  const option = q?.options.find((o) => !q.correctOptionIds.includes(o.id));
  if (!option) throw new Error(`no wrong option for ${questionId}`);
  return [option.id];
};
const FULL_REVIEW = {
  thesis: 'Pullback to support in an uptrend',
  planVsActual: 'Followed the plan',
  rulesFollowed: true,
  resultNote: '',
  lesson: 'Waiting for the close kept me out of a fake break',
  nextGoal: '',
  reviewedAt: T,
} as JournalEntry['review'];

describe('progress facts from stored records (spec §23)', () => {
  it('grades lesson checks with the question’s own skill tags and records mastered lessons and checkpoints', () => {
    const f = progressFacts(content, {
      ...EMPTY,
      quizAttempts: [
        quiz('lesson_check', 'fx-position-sizing', { 'fx-position-sizing-q1': ['a'], 'fx-position-sizing-q2': ['a'] }, true),
        quiz('checkpoint', 'forex-risk-checkpoint', {}, true),
        quiz('review', 'review-2026-10-29', { 'fx-position-sizing-q2': ['correct'], 'fx-position-sizing-q3': ['incorrect', 'early'] }, false),
      ],
    });
    expect(f.answers.map((a) => [a.questionId, a.correct, a.skills, a.lessonId, a.contextId])).toEqual([
      ['fx-position-sizing-q1', true, ['risk_management'], 'fx-position-sizing', 'forex-risk'],
      ['fx-position-sizing-q2', false, ['risk_management'], 'fx-position-sizing', 'forex-risk'],
    ]);
    expect(f.retests).toEqual([
      { questionId: 'fx-position-sizing-q2', skills: ['risk_management'], correct: true, genuinelyDue: true, at: T },
      { questionId: 'fx-position-sizing-q3', skills: ['risk_management'], correct: false, genuinelyDue: false, at: T },
    ]);
    expect([...f.masteredLessonIds]).toEqual(['fx-position-sizing']);
    expect([...f.passedCheckpointModuleIds]).toEqual(['forex-risk']);
  });

  it('reads strategy knowledge checks and exercises, and completes strategy pages from real attempts', () => {
    const strategy = content.strategy('breakout-volume-confirmation');
    if (!strategy) throw new Error('missing strategy');
    const picked = strategy.knowledgeCheck.map((q) => `${q.id}=${q.correctOptionIds[0]}`);
    const labs: LabAttempt[] = [
      { id: '1', kind: 'strategy_check', refId: strategy.id, picked, score: 1, answeredAt: T },
      { id: '2', kind: 'strategy_exercise', refId: strategy.id, picked: [], score: 0.9, answeredAt: T },
      { id: '3', kind: 'red_flag', refId: 'rf-1', picked: [], score: 0.5, answeredAt: T },
    ];
    const f = progressFacts(content, { ...EMPTY, labAttempts: labs });
    expect(f.answers).toHaveLength(strategy.knowledgeCheck.length);
    expect(f.answers.every((a) => a.correct && a.contextId === strategy.id && a.skills.includes('strategy_understanding'))).toBe(true);
    expect(f.strategyExercises).toEqual([{ strategyId: strategy.id, skills: strategy.skills, score: 0.9, at: T }]);
    expect([...f.completedStrategyIds]).toEqual([strategy.id]);
    expect(f.labs).toEqual([{ kind: 'red_flag', refId: 'rf-1', score: 0.5, at: T }]);
    // No reviewed trader ships yet, so none can be "studied".
    expect(f.tradersStudied).toBe(0);
  });

  it('keeps only rule-checked trades, as process facts', () => {
    const f = progressFacts(content, {
      ...EMPTY,
      journal: [trade(), trade({ source: 'replay' }), trade({ source: 'mt_import' }), trade({ source: 'manual', stop: null, ruleViolations: ['max_risk'], entryRationale: ' ' })],
    });
    expect(f.checkedTrades.map(({ at: _at, ...t }) => t)).toEqual([
      { ruleBroken: false, hasStop: true, hasRationale: true, emotionRated: false, reviewed: false, appVerified: true },
      { ruleBroken: true, hasStop: false, hasRationale: false, emotionRated: false, reviewed: false, appVerified: false },
    ]);
  });

  it('checks a hand-entered trade’s planned risk against the learner’s limit', () => {
    // 50% of equity at risk with no rule violation recorded (manual entries never ran the rule check).
    const oversized = trade({ source: 'manual', plannedRisk: '5000', equityAtEntry: '10000', ruleViolations: [] });
    expect(checkedTrade(oversized, 1).ruleBroken).toBe(true);
    expect(checkedTrade({ ...oversized, plannedRisk: '100' }, 1).ruleBroken).toBe(false);
    // Unknown risk cannot be judged, so it is not counted as broken.
    expect(checkedTrade({ ...oversized, plannedRisk: null }, 1).ruleBroken).toBe(false);
  });

  it('needs substance for a rationale and a review', () => {
    expect(checkedTrade(trade({ entryRationale: '.' }), 1).hasRationale).toBe(false);
    expect(checkedTrade(trade({ review: { ...FULL_REVIEW!, thesis: '', planVsActual: '', lesson: '.' } }), 1).reviewed).toBe(false);
    expect(substantialReview({ ...FULL_REVIEW!, thesis: 'ok', planVsActual: 'fine', lesson: '' })).toBe(false);
    expect(checkedTrade(trade({ review: FULL_REVIEW }), 1).reviewed).toBe(true);
  });

  it('saves placement results as evidence: passed placements count as passed checkpoints', () => {
    const f = progressFacts(content, {
      ...EMPTY,
      quizAttempts: [quiz('placement', 'forex-risk-checkpoint', { 'forex-risk-checkpoint-q1': ['a'] }, true), quiz('placement', 'forex-basics-checkpoint', {}, false)],
    });
    expect([...f.passedCheckpointModuleIds]).toEqual(['forex-risk']);
    expect(f.answers).toEqual([expect.objectContaining({ questionId: 'forex-risk-checkpoint-q1', correct: true, skills: ['risk_management'], contextId: 'forex-risk' })]);
  });

  it('process over profit: changing P/L, size, equity or leverage changes no fact, score or award', () => {
    const base = Array.from({ length: 10 }, () => trade());
    const reckless = base.map((t, i) => ({ ...t, pnlMoney: i % 2 ? '50000' : '-9000', pnlR: '12', size: '5000000', equityAtEntry: '100' }));
    const a = progressFacts(content, { ...EMPTY, journal: base });
    const b = progressFacts(content, { ...EMPTY, journal: reckless });
    expect(b).toEqual(a);
    const award = (f: typeof a) => awards({ facts: f, mastery: allSkillMastery(f), challenges: content.challenges(), tradersAvailable: false, unlocked: NO_UNLOCKS });
    expect(award(b)).toEqual(award(a));
    expect(skillMastery(b, 'execution_discipline')).toEqual(skillMastery(a, 'execution_discipline'));
  });

  it('counts completed classes by local date, and program units', () => {
    const cls = (completedAt: string | null, status: DailyClass['status']) => ({ status, completedAt }) as DailyClass;
    const f = progressFacts(content, {
      ...EMPTY,
      classes: [cls('2026-10-28T23:30:00.000Z', 'completed'), cls('2026-10-29T08:00:00.000Z', 'completed'), cls(null, 'planned')],
      completedUnitIds: new Set(['a', 'b']),
      programId: 'practical-forex-trader',
    });
    // 23:30 UTC is already the 29th in Lagos (UTC+1), so both classes fall on one day.
    expect(f.classDates).toEqual([toLocalDate('2026-10-29')]);
    expect(f.program?.done).toBe(2);
    expect(f.program?.total).toBeGreaterThan(10);
  });
});

describe('dashboard (spec §29)', () => {
  it('builds recommendations with lesson titles, shipped challenges and no trader badge before review', () => {
    const lessonQs = ['fx-position-sizing-q1', 'fx-position-sizing-q2', 'fx-position-sizing-q3'];
    const checkpointQs = ['forex-risk-checkpoint-q1', 'forex-risk-checkpoint-q2'];
    const facts = progressFacts(content, {
      ...EMPTY,
      quizAttempts: [
        quiz('lesson_check', 'fx-position-sizing', Object.fromEntries(lessonQs.map((q) => [q, wrong(q)])), false),
        quiz('checkpoint', 'forex-risk-checkpoint', Object.fromEntries(checkpointQs.map((q) => [q, wrong(q)])), false),
      ],
      journal: [trade({ source: 'replay' })],
    });
    const d = buildDashboard(
      dashboardContent({ content }),
      dashboardInput({ facts, journal: [trade({ source: 'replay' })], today: toLocalDate('2026-10-29'), timeZone: 'Africa/Lagos', studyDays: [1, 3, 5], streaks: true }),
    );
    const rec = d.recommendations.find((r) => r.skill === 'risk_management');
    expect(rec?.reason).toBe(`You missed 3 of your last 3 risk management questions in "${content.lesson('fx-position-sizing')?.title}".`);
    expect(rec?.steps.slice(0, 3)).toEqual([
      { kind: 'review', questionIds: expect.arrayContaining(lessonQs) },
      { kind: 'lesson', lessonId: 'fx-position-sizing', title: content.lesson('fx-position-sizing')?.title },
      { kind: 'drill', drillKind: 'size_it' },
    ]);
    expect(d.challenges.map((c) => c.challenge.id)).not.toContain('famous-trader');
    expect(d.awards.badges.map((b) => b.id)).not.toContain('famous_traders_researcher');
    expect(d.simulated.bySource).toEqual([{ source: 'replay', trades: 1 }]);
    expect(d.streak).toEqual({ current: 0, doneToday: false, todayIsStudyDay: false });
    expect(d.week.from).toBe('2026-10-26');
    expect(weekStart(toLocalDate('2026-10-26'))).toBe('2026-10-26');
    expect(weekStart(toLocalDate('2026-11-01'))).toBe('2026-10-26');
  });

  it('summarises learning results: checkpoints, drills, replays, strategies, backtests, journal habits and this week', () => {
    const journal = [trade({ review: FULL_REVIEW }), trade({ ruleViolations: ['max_risk'], stop: null })];
    const facts = progressFacts(content, {
      ...EMPTY,
      quizAttempts: [quiz('checkpoint', 'forex-risk-checkpoint', {}, true), quiz('lesson_check', 'fx-position-sizing', { 'fx-position-sizing-q1': ['a'] }, true)],
      drillAttempts: [true, false].map((correct, i) => ({ id: `${i}`, kind: 'size_it', seed: i, optionId: 'x', correct, answeredAt: T }) as never),
      replays: [{ scenarioKind: 'range', processScore: 0.5, finishedAt: T }, { scenarioKind: 'breakout', processScore: null, finishedAt: T }] as never,
      backtests: [{ inputs: { split: { kind: 'holdout' } }, createdAt: T }, { inputs: { split: { kind: 'none' } }, createdAt: T }],
      journal,
      classes: [{ status: 'completed', completedAt: T } as DailyClass],
    });
    const d = buildDashboard(dashboardContent({ content }), dashboardInput({ facts, journal, today: toLocalDate('2026-10-29'), timeZone: 'Africa/Lagos', studyDays: [4], streaks: true }));
    expect(d.learning.checkpoints).toEqual([{ moduleId: 'forex-risk', title: content.module('forex-risk')?.title, passed: true }]);
    expect(d.learning.lessonsMastered).toBe(1);
    expect(d.learning.drills).toEqual([{ kind: 'size_it', title: 'Size it', right: 1, of: 2 }]);
    expect(d.learning.replays).toEqual({ finished: 2, averageProcess: 0.5, conditions: 2 });
    expect(d.learning.strategies).toEqual({ completed: 0, total: content.strategies().length });
    expect(d.learning.backtests).toEqual({ saved: 2, outOfSample: 1 });
    expect(d.learning.journal).toEqual({ checkedTrades: 2, reviewed: 1, withStop: 1, withoutBreaks: 1, commonBreaks: [{ rule: 'max_risk', count: 1 }] });
    expect(d.learning.recentLessons).toEqual([{ lessonId: 'fx-position-sizing', title: content.lesson('fx-position-sizing')?.title, at: T, mastered: true }]);
    expect(d.week).toEqual({ from: '2026-10-26', classes: 1, answers: 1, reviews: 0, drills: 2, replays: 2 });
    expect(d.streak).toEqual({ current: 1, doneToday: true, todayIsStudyDay: true });
    expect(d.simulated.bySource).toEqual([{ source: 'paper', trades: 2 }]);
  });

  it('hides the streak when turned off', () => {
    const facts = progressFacts(content, EMPTY);
    const d = buildDashboard(dashboardContent({ content }), dashboardInput({ facts, journal: [], today: toLocalDate('2026-10-29'), timeZone: 'UTC', studyDays: [], streaks: false }));
    expect(d.streak).toBeNull();
    expect(d.recommendations).toEqual([]);
  });
});
