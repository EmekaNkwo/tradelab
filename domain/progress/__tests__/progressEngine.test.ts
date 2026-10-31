import { toLocalDate } from '../../learning/dates';
import type { Challenge, ChallengeCriterion, ChallengeRequirement } from '../../models/progress';
import { AWARD_SOURCES, awardKey, awards, DAILY_DRILL_XP_CAP, DAILY_RETEST_XP_CAP, XP, type AwardInput } from '../awards';
import { challengeProgress, criterionProgress } from '../challenges';
import { allSkillMastery } from '../mastery';
import { missedQuestionIds, recommendations, weakDrillFor, type RecommendationContent } from '../recommendations';
import { RECORD_FIELDS, type AnswerRecord, type CheckedTradeRecord, type ProgressFacts, type RetestRecord } from '../records';
import { studyStreak } from '../streak';
import { at, emptyFacts, facts } from './fixtures';

const content: RecommendationContent = {
  lessonTitle: (id) => ({ l1: 'Trends', 'm2-first': 'First lesson of M2' })[id] ?? null,
  moduleTitle: (id) => ({ m: 'Charts', m2: 'Module two' })[id] ?? null,
  firstLessonOf: (id) => (id === 'm2' ? 'm2-first' : null),
  conceptsFor: () => [{ id: 'ta-trends', lab: 'technical', title: 'Trends', scenario: 'strong_uptrend' }],
  drillTitle: (k) => k,
};
const noConcepts: RecommendationContent = { ...content, conceptsFor: () => [] };

const trade = (over: Partial<CheckedTradeRecord> = {}, n = 0): CheckedTradeRecord => ({
  ruleBroken: false,
  hasStop: true,
  hasRationale: true,
  emotionRated: true,
  reviewed: false,
  appVerified: true,
  at: at(n),
  ...over,
});

const answer = (questionId: string, correct: boolean, n: number, over: Partial<AnswerRecord> = {}): AnswerRecord => ({
  questionId,
  skills: ['chart_reading'],
  lessonId: 'l1',
  contextId: 'm',
  correct,
  at: at(n),
  ...over,
});
const retest = (questionId: string, correct: boolean, n: number, genuinelyDue = true): RetestRecord => ({ questionId, skills: ['chart_reading'], correct, genuinelyDue, at: at(n) });

const awardsFor = (f: ProgressFacts, over: Partial<AwardInput> = {}) =>
  awards({ facts: f, mastery: allSkillMastery(f), challenges: [], tradersAvailable: false, unlocked: new Map(), ...over });

const crit = (c: ChallengeRequirement): ChallengeCriterion => ({ ...c, label: 'x', dimension: 'understanding' }) as ChallengeCriterion;

describe('recommendations (spec §23)', () => {
  const weak = facts({ answers: [1, 2, 3, 4, 5].map((i) => answer(`q${i}`, i >= 4, i)) });

  it('builds a path from the lesson with the most misses, with the reason', () => {
    const [r] = recommendations(weak, allSkillMastery(weak), content);
    expect(r?.skill).toBe('chart_reading');
    expect(r?.reason).toBe('You missed 3 of your last 5 chart reading questions in "Trends".');
    expect(r?.steps.map((s) => s.kind)).toEqual(['review', 'lesson', 'drill', 'lab', 'replay']);
    expect(r?.steps[0]).toEqual({ kind: 'review', questionIds: ['q3', 'q2', 'q1'] });
    expect(r?.steps.at(-1)).toEqual({ kind: 'replay', scenario: 'strong_uptrend' });
  });

  it('recommends nothing without evidence, while it is too early to tell, or when skills are strong', () => {
    expect(recommendations(emptyFacts, allSkillMastery(emptyFacts), content)).toEqual([]);
    const oneWrong = facts({ answers: [answer('q1', false, 1)] });
    expect(allSkillMastery(oneWrong).find((m) => m.skill === 'chart_reading')?.level).toBe('early');
    expect(recommendations(oneWrong, allSkillMastery(oneWrong), content)).toEqual([]);
    const strong = facts({ answers: [1, 2, 3, 4, 5].map((i) => answer(`q${i}`, true, i)) });
    expect(recommendations(strong, allSkillMastery(strong), content)).toEqual([]);
  });

  it('explains weak drills and rule breaks when there are no missed questions', () => {
    const drills = facts({ drills: [1, 2, 3, 4, 5].map((i) => ({ kind: 'find_the_trend', correct: i === 1, at: at(i) })) });
    expect(recommendations(drills, allSkillMastery(drills), content)[0]?.reason).toBe('You got 1 of your last 5 find_the_trend drills right.');
    const trades = facts({ checkedTrades: [1, 2, 3, 4, 5].map((i) => trade(i % 2 === 0 ? { ruleBroken: true } : { hasStop: false }, i)) });
    const reasons = recommendations(trades, allSkillMastery(trades), content).map((r) => r.reason);
    expect(reasons).toContain('5 of your last 5 rule-checked trades broke a rule, risked more than your limit or had no stop.');
  });

  it('pools misses outside lessons per module, sends checkpoint misses to the module’s first lesson', () => {
    const f = facts({
      answers: [
        ...[1, 2, 3].map((i) => answer(`m2-cp-q${i}`, false, i, { lessonId: null, contextId: 'm2' })),
        ...[4, 5, 6].map((i) => answer(`m3-cp-q${i}`, i === 4, i, { lessonId: null, contextId: 'm3' })),
      ],
    });
    const [r] = recommendations(f, allSkillMastery(f), noConcepts);
    expect(r?.reason).toBe('You missed 3 of your last 3 chart reading questions in "Module two".');
    expect(r?.steps.find((s) => s.kind === 'lesson')).toEqual({ kind: 'lesson', lessonId: 'm2-first', title: 'First lesson of M2' });
  });

  it('always offers a step: the Psychology Lab for psychology', () => {
    const f = facts({ psych: [1, 2, 3, 4, 5].map((i) => ({ scenarioId: `p${i}`, quality: 'harmful' as const, at: at(i) })) });
    const [r] = recommendations(f, allSkillMastery(f), noConcepts);
    expect(r?.skill).toBe('psychology');
    expect(r?.steps).toEqual([{ kind: 'psych' }]);
  });

  it('picks the drill the learner is actually weak at, and Size it for risk before any attempt', () => {
    expect(weakDrillFor(emptyFacts, 'risk_management')).toBe('size_it');
    const f = facts({
      drills: [
        ...[1, 2, 3].map((i) => ({ kind: 'size_it', correct: true, at: at(i) })),
        ...[4, 5, 6].map((i) => ({ kind: 'where_is_the_stop', correct: false, at: at(i) })),
      ],
    });
    expect(weakDrillFor(f, 'risk_management')).toBe('where_is_the_stop');
  });

  it('lists questions whose latest answer was wrong, until a later re-test gets them right', () => {
    expect(missedQuestionIds(weak)).toEqual(['q3', 'q2', 'q1']);
    // A brought-forward re-test still shows the learner has got it right since.
    const fixed = facts({ ...weak, retests: [retest('q2', true, 10, false)] });
    expect(missedQuestionIds(fixed)).toEqual(['q3', 'q1']);
    const [r] = recommendations(fixed, allSkillMastery(fixed), content);
    expect(r?.steps[0]).toEqual({ kind: 'review', questionIds: ['q3', 'q1'] });
  });

  it('re-testing the same question again and again changes nothing beyond the first counted re-test', () => {
    const base = facts({ answers: [1, 2, 3, 4, 5].map((i) => answer(`q${i}`, i !== 2, i)), retests: [retest('q2', true, 10)] });
    const spam = facts({ ...base, retests: [...base.retests, ...Array.from({ length: 100 }, (_, i) => retest('q2', true, 10 + (i + 1) / 1000))] });
    expect(allSkillMastery(spam)).toEqual(allSkillMastery(base));
    expect(awardsFor(spam).xp).toBe(awardsFor(base).xp);
  });
});

describe('challenges (spec §27)', () => {
  it('checks checkpoints, drills and clean trades against records', () => {
    const f = facts({
      passedCheckpointModuleIds: new Set(['forex-risk']),
      drills: Array.from({ length: 10 }, (_, i) => ({ kind: 'size_it', correct: i !== 0, at: at(i) })),
      checkedTrades: [trade({}, 3), trade({}, 2), trade({ ruleBroken: true }, 1)],
    });
    expect(criterionProgress(crit({ kind: 'checkpoint_passed', moduleId: 'forex-risk' }), f).met).toBe(true);
    const drill = criterionProgress(crit({ kind: 'drill', drillKind: 'size_it', count: 10, accuracy: 0.8 }), f);
    expect(drill).toMatchObject({ met: true, detail: '9 of your last 10 right (need 8)' });
    const clean = criterionProgress(crit({ kind: 'clean_trades', count: 5 }), f);
    expect(clean).toMatchObject({ met: false, current: 2 });
  });

  it('accepts the matching checkpoint from either program', () => {
    const c = crit({ kind: 'checkpoint_passed', moduleId: 'forex-backtest-plan', orModuleIds: ['ta-advanced'] });
    expect(criterionProgress(c, facts({ passedCheckpointModuleIds: new Set(['ta-advanced']) })).met).toBe(true);
    expect(criterionProgress(c, emptyFacts).met).toBe(false);
  });

  it('counts only clean paper trades: a stop, no rule broken, risk within the limit', () => {
    const c = crit({ kind: 'clean_trades', count: 3 });
    // An oversized trade is recorded as a rule break (risk over the limit), so it is not clean.
    expect(criterionProgress(c, facts({ checkedTrades: [trade({}, 1), trade({}, 2), trade({ ruleBroken: true }, 3)] })).met).toBe(false);
    // Hand-entered trades are not checked by the app, so they neither count nor break the run.
    const manual = Array.from({ length: 10 }, (_, i) => trade({ appVerified: false }, 10 + i));
    expect(criterionProgress(c, facts({ checkedTrades: manual })).current).toBe(0);
    expect(criterionProgress(c, facts({ checkedTrades: [trade({}, 1), trade({}, 2), trade({}, 3), ...manual] })).met).toBe(true);
  });

  it('extra clean trades beyond a requirement change nothing', () => {
    const c = crit({ kind: 'clean_trades', count: 3 });
    const base = facts({ checkedTrades: [1, 2, 3].map((i) => trade({}, i)) });
    for (const extra of [1, 5, 40]) {
      const more = facts({ checkedTrades: [...base.checkedTrades, ...Array.from({ length: extra }, (_, i) => trade({}, 10 + i))] });
      expect(criterionProgress(c, more)).toEqual(criterionProgress(c, base));
      expect(awardsFor(more).xp).toBe(awardsFor(base).xp);
    }
  });

  it('judges lab cases on the latest attempt, not the best', () => {
    const c = crit({ kind: 'lab_cases', labKind: 'red_flag', count: 1, minScore: 0.8 });
    const better = facts({ labs: [{ kind: 'red_flag', refId: 'a', score: 0.5, at: at(1) }, { kind: 'red_flag', refId: 'a', score: 0.9, at: at(2) }] });
    const worse = facts({ labs: [{ kind: 'red_flag', refId: 'a', score: 0.9, at: at(1) }, { kind: 'red_flag', refId: 'a', score: 0.5, at: at(2) }] });
    expect(criterionProgress(c, better).met).toBe(true);
    expect(criterionProgress(c, worse).met).toBe(false);
  });

  it('needs enough attempts, not just a high hit rate', () => {
    const f = facts({ drills: [{ kind: 'size_it', correct: true, at: at(1) }] });
    expect(criterionProgress(crit({ kind: 'drill', drillKind: 'size_it', count: 10, accuracy: 0.8 }), f).met).toBe(false);
  });

  it('covers every requirement kind', () => {
    const f = facts({
      answers: [answer('q', true, 1, { skills: ['risk_management'], lessonId: null })],
      checkedTrades: [trade({ reviewed: true })],
      replays: [{ scenarioKind: 'range', processScore: 1, at: at(1) }, { scenarioKind: 'breakout', processScore: 1, at: at(2) }],
      labs: [{ kind: 'red_flag', refId: 'a', score: 0.5, at: at(1) }, { kind: 'red_flag', refId: 'a', score: 0.9, at: at(2) }],
      completedStrategyIds: new Set(['s']),
      backtests: [{ testedOutOfSample: true, at: at(1) }, { testedOutOfSample: false, at: at(2) }],
      completedMtTaskIds: new Set(['t1']),
      tradersStudied: 1,
    });
    const met = (c: ChallengeRequirement) => criterionProgress(crit(c), f).met;
    expect(met({ kind: 'skill_questions', skill: 'risk_management', count: 1, accuracy: 1 })).toBe(true);
    expect(met({ kind: 'reviewed_trades', count: 1 })).toBe(true);
    expect(met({ kind: 'replays', count: 2, minProcessScore: 1, conditions: 2 })).toBe(true);
    expect(met({ kind: 'replays', count: 2, minProcessScore: 1, conditions: 3 })).toBe(false);
    expect(met({ kind: 'lab_cases', labKind: 'red_flag', count: 1, minScore: 0.8 })).toBe(true);
    expect(met({ kind: 'strategies_completed', count: 1 })).toBe(true);
    expect(met({ kind: 'backtests_tested_out_of_sample', count: 2 })).toBe(false);
    expect(met({ kind: 'mt_tasks', taskIds: ['t1', 't2'] })).toBe(false);
    expect(met({ kind: 'traders_studied', count: 1 })).toBe(true);
  });

  it('completes when every criterion is met, and reports dimensions', () => {
    const c: Challenge = {
      id: 'c',
      type: 'risk_management',
      title: 'C',
      summary: 'S',
      skills: ['risk_management'],
      criteria: [
        { kind: 'checkpoint_passed', moduleId: 'forex-risk', label: 'a', dimension: 'understanding' },
        { kind: 'clean_trades', count: 1, label: 'b', dimension: 'rule_use' },
      ],
    };
    const half = challengeProgress(c, facts({ passedCheckpointModuleIds: new Set(['forex-risk']) }));
    expect(half).toMatchObject({ completed: false, progress: 0.5 });
    expect(half.dimensions).toEqual([{ dimension: 'understanding', met: true }, { dimension: 'rule_use', met: false }]);
    expect(challengeProgress(c, facts({ passedCheckpointModuleIds: new Set(['forex-risk']), checkedTrades: [trade()] })).completed).toBe(true);
  });
});

describe('awards (spec §29): process over profit', () => {
  const BANNED = /pnl|profit|loss|gain|balance|equity|size|units|lots?$|volume|leverage|return/i;

  it('no award source reads a fact with a profit, size, volume or leverage field', () => {
    for (const [award, sources] of Object.entries(AWARD_SOURCES)) {
      for (const fact of sources) {
        for (const field of RECORD_FIELDS[fact]) {
          // The one count is of reviewed traders studied, which is not trading volume.
          if (fact === 'tradersStudied') continue;
          expect({ award, fact, field, banned: BANNED.test(field) }).toEqual({ award, fact, field, banned: false });
        }
      }
    }
  });

  it('RECORD_FIELDS lists exactly the fields the records hold', () => {
    const sample: { [K in keyof ProgressFacts]: unknown } = {
      answers: { questionId: '', skills: [], lessonId: null, contextId: '', correct: true, at: '' },
      retests: { questionId: '', skills: [], correct: true, genuinelyDue: true, at: '' },
      drills: { kind: '', correct: true, at: '' },
      checkedTrades: trade(),
      replays: { scenarioKind: '', processScore: null, at: '' },
      labs: { kind: 'scenario', refId: '', score: 0, at: '' },
      strategyExercises: { strategyId: '', skills: [], score: 0, at: '' },
      psych: { scenarioId: '', quality: 'mixed', at: '' },
      backtests: { testedOutOfSample: true, at: '' },
      passedCheckpointModuleIds: null,
      masteredLessonIds: null,
      completedStrategyIds: null,
      tradersStudied: null,
      completedMtTaskIds: null,
      classDates: null,
      program: { done: 0, total: 0 },
      timeZone: null,
    };
    for (const [fact, value] of Object.entries(sample)) {
      if (value && typeof value === 'object') expect(Object.keys(value).sort()).toEqual([...RECORD_FIELDS[fact as keyof ProgressFacts]].sort());
    }
    expect(Object.keys(RECORD_FIELDS).sort()).toEqual(Object.keys(emptyFacts).sort());
  });

  it('awards nothing on an empty record and is idempotent', () => {
    const empty = awardsFor(emptyFacts);
    expect(empty.xp).toBe(0);
    expect(empty.badges.every((b) => !b.earned)).toBe(true);
    expect(empty.badges.map((b) => b.id)).not.toContain('famous_traders_researcher');
    const f = facts({ masteredLessonIds: new Set(['a', 'b']), passedCheckpointModuleIds: new Set(['forex-risk']) });
    expect(awardsFor(f, { tradersAvailable: true })).toEqual(awardsFor(f, { tradersAvailable: true }));
    expect(awardsFor(f).xp).toBe(2 * XP.masteredLesson + XP.passedCheckpoint);
    expect(awardsFor(f, { tradersAvailable: true }).badges.map((b) => b.id)).toContain('famous_traders_researcher');
  });

  it('caps drills and re-tests per learner day', () => {
    const sameDay = (n: number) => new Date(Date.UTC(2026, 9, 1, 8) + n * 60_000).toISOString();
    const f = facts({
      drills: Array.from({ length: 50 }, (_, i) => ({ kind: 'size_it', correct: true, at: sameDay(i) })),
      retests: Array.from({ length: 30 }, (_, i) => ({ ...retest(`q${i}`, true, 0), at: sameDay(i) })),
    });
    const a = awardsFor(f);
    expect(a.lines.find((l) => l.source === 'correctDrill')?.count).toBe(DAILY_DRILL_XP_CAP);
    expect(a.lines.find((l) => l.source === 'correctRetest')?.count).toBe(DAILY_RETEST_XP_CAP);
  });

  it('splits the day cap at the learner’s midnight, not UTC', () => {
    // 22:30 and 23:30 UTC on 1 Oct: one day in UTC, two in Lagos (UTC+1).
    const drills = [...Array.from({ length: 10 }, () => '2026-10-01T22:30:00.000Z'), ...Array.from({ length: 10 }, () => '2026-10-01T23:30:00.000Z')].map((t) => ({ kind: 'size_it', correct: true, at: t }));
    expect(awardsFor(facts({ drills, timeZone: 'UTC' })).lines.find((l) => l.source === 'correctDrill')?.count).toBe(10);
    expect(awardsFor(facts({ drills, timeZone: 'Africa/Lagos' })).lines.find((l) => l.source === 'correctDrill')?.count).toBe(20);
  });

  it('gives journal-review XP once at 5 and at 20 reviewed trades, never per trade', () => {
    const reviewed = (n: number) => facts({ checkedTrades: Array.from({ length: n }, (_, i) => trade({ reviewed: true }, i * 24)) });
    const xpFor = (n: number) => awardsFor(reviewed(n)).lines.find((l) => l.source === 'reviewMilestone')?.xp;
    expect(xpFor(4)).toBe(0);
    expect(xpFor(5)).toBe(XP.reviewMilestone);
    expect(xpFor(19)).toBe(XP.reviewMilestone);
    expect(xpFor(20)).toBe(2 * XP.reviewMilestone);
    expect(xpFor(200)).toBe(2 * XP.reviewMilestone);
  });

  it('earns the discipline badge only from clean paper trades, and the journal badge from reviews', () => {
    const f = facts({
      checkedTrades: Array.from({ length: 10 }, (_, i) => trade({ reviewed: i < 5 }, i)),
      program: { done: 5, total: 10 },
      classDates: [toLocalDate('2026-10-01')],
    });
    const a = awardsFor(f);
    expect(a.badges.filter((b) => b.earned).map((b) => b.id)).toEqual(['disciplined_simulator', 'journal_reviewer']);
    expect(a.milestones.filter((m) => m.reached).map((m) => m.id)).toEqual(['first_class', 'program_25', 'program_50', 'reviews_5']);
    const manual = facts({ checkedTrades: f.checkedTrades.map((t) => ({ ...t, appVerified: false })) });
    expect(awardsFor(manual).badges.find((b) => b.id === 'disciplined_simulator')?.earned).toBe(false);
    // One oversized paper trade (recorded as over the risk limit) among the last ten loses it.
    const oversized = facts({ checkedTrades: [...f.checkedTrades.slice(1), trade({ ruleBroken: true }, 50)] });
    expect(awardsFor(oversized).badges.find((b) => b.id === 'disciplined_simulator')?.earned).toBe(false);
  });

  it('latches awards: once met they stay earned with their date and XP, and are reported as new only once', () => {
    const c: Challenge = { id: 'c', type: 'risk_management', title: 'C', summary: 'S', skills: ['risk_management'], criteria: [{ kind: 'clean_trades', count: 1, label: 'b', dimension: 'rule_use' }] };
    const met = facts({ checkedTrades: [trade({}, 1)] });
    const first = awardsFor(met, { challenges: [c] });
    expect(first.newUnlocks).toContainEqual({ kind: 'challenge', id: 'c' });
    expect(first.completedChallenges.get('c')).toBeNull();
    const stored = new Map(first.newUnlocks.map((u) => [awardKey(u.kind, u.id), '2026-10-02T09:00:00.000Z']));
    // Later a rule is broken: the challenge is no longer met from the records, but stays completed.
    const later = facts({ checkedTrades: [trade({}, 1), trade({ ruleBroken: true }, 2)] });
    const after = awardsFor(later, { challenges: [c], unlocked: stored });
    expect(after.newUnlocks).toEqual([]);
    expect(after.completedChallenges.get('c')).toBe('2026-10-02T09:00:00.000Z');
    expect(after.lines.find((l) => l.source === 'completedChallenge')?.xp).toBe(XP.completedChallenge);
    expect(after.badges.every((b) => (b.earned ? b.earnedAt !== null : b.earnedAt === null))).toBe(true);
  });
});

describe('study streak (spec §29)', () => {
  const d = (s: string) => toLocalDate(s);
  // 2026-10-26 is a Monday; study days Mon, Wed, Fri.
  const days = [1, 3, 5] as const;

  it('skips rest days and does not break before today is over', () => {
    const classes = [d('2026-10-23'), d('2026-10-26'), d('2026-10-28')];
    expect(studyStreak(classes, days, d('2026-10-30'))).toEqual({ current: 3, doneToday: false, todayIsStudyDay: true });
    expect(studyStreak([...classes, d('2026-10-30')], days, d('2026-10-30')).current).toBe(4);
  });

  it('ends at a missed study day', () => {
    expect(studyStreak([d('2026-10-23'), d('2026-10-28')], days, d('2026-10-29')).current).toBe(1);
    expect(studyStreak([], days, d('2026-10-29')).current).toBe(0);
    expect(studyStreak([d('2026-10-28')], [], d('2026-10-29')).current).toBe(0);
  });

  it('counts a class done on a rest day', () => {
    expect(studyStreak([d('2026-10-25'), d('2026-10-26')], days, d('2026-10-27')).current).toBe(2);
  });
});
