import type { SkillId } from '../../models/progress';
import { allSkillMastery, evidenceSummary, levelFor, MASTERY_WEIGHTS, skillMastery } from '../mastery';
import type { AnswerRecord, CheckedTradeRecord, RetestRecord } from '../records';
import { at, emptyFacts, facts } from './fixtures';

const answer = (questionId: string, correct: boolean, n: number, skills: SkillId[] = ['chart_reading'], contextId = 'forex-charts', lessonId: string | null = 'l1'): AnswerRecord => ({
  questionId,
  skills,
  lessonId,
  contextId,
  correct,
  at: at(n),
});

const retest = (questionId: string, correct: boolean, n: number, genuinelyDue = true): RetestRecord => ({ questionId, skills: ['chart_reading'], correct, genuinelyDue, at: at(n) });
const trade = (over: Partial<CheckedTradeRecord> = {}, n = 0): CheckedTradeRecord => ({
  ruleBroken: false,
  hasStop: true,
  hasRationale: true,
  emotionRated: true,
  reviewed: true,
  appVerified: true,
  at: at(n),
  ...over,
});

describe('skill mastery (spec §23)', () => {
  it('has no score and no level without evidence', () => {
    const m = skillMastery(emptyFacts, 'chart_reading');
    expect(m.score).toBeNull();
    expect(m.level).toBe('no_evidence');
    expect(evidenceSummary(m.evidence)).toBe('No evidence yet.');
    expect(allSkillMastery(emptyFacts)).toHaveLength(10);
  });

  it('weights are documented and sum to 1', () => {
    expect(Object.values(MASTERY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('uses the latest counted answer to each question: the first, or one a day or more after the last try', () => {
    // A retake an hour later (straight after the feedback) is ignored; one 30 hours later counts.
    const retakeSoon = skillMastery(facts({ answers: [answer('q1', false, 1), answer('q1', true, 2), answer('q2', false, 3)] }), 'chart_reading');
    expect(retakeSoon.components.correctness).toBe(0);
    expect(retakeSoon.evidence.answers).toBe(2);
    const retakeLater = skillMastery(facts({ answers: [answer('q1', false, 1), answer('q1', true, 2), answer('q1', true, 30), answer('q2', false, 3)] }), 'chart_reading');
    expect(retakeLater.components.correctness).toBe(0.5);
  });

  it('counts a question only for the skills it is tagged with', () => {
    const f = facts({ answers: [answer('q1', true, 1, ['risk_management'])] });
    expect(skillMastery(f, 'chart_reading').score).toBeNull();
    expect(skillMastery(f, 'risk_management').components.correctness).toBe(1);
  });

  it('renormalises the weights over the components present', () => {
    // Correctness 1 and application 0, nothing else but breadth.
    const f = facts({
      answers: [answer('q1', true, 1)],
      drills: [{ kind: 'find_the_trend', correct: false, at: at(2) }],
    });
    const m = skillMastery(f, 'chart_reading');
    expect(m.components).toEqual({ correctness: 1, application: 0, retention: null, breadth: 1 / 3, reasoning: null });
    const w = MASTERY_WEIGHTS;
    expect(m.score).toBeCloseTo((w.correctness * 1 + w.application * 0 + w.breadth / 3) / (w.correctness + w.application + w.breadth));
  });

  it('measures retention from spaced re-tests', () => {
    const f = facts({ retests: [retest('q1', true, 1), retest('q2', false, 2)] });
    expect(skillMastery(f, 'chart_reading').components.retention).toBe(0.5);
  });

  it('counts only genuinely due re-tests, one per question per learner day', () => {
    const early = facts({ retests: [retest('q1', true, 1, false)] });
    expect(skillMastery(early, 'chart_reading').components.retention).toBeNull();
    // A miss, then the same question re-tested right 50 times that day: only the first counts.
    const spam = facts({ retests: [retest('q1', false, 1), ...Array.from({ length: 50 }, (_, i) => retest('q1', true, 2 + i / 100))] });
    expect(skillMastery(spam, 'chart_reading').components.retention).toBe(0);
    expect(skillMastery(spam, 'chart_reading').evidence.retests).toBe(1);
    // In Lagos (UTC+1) 23:30 UTC is already the next day, so it counts again.
    const lateUtc = (h: number, m: number) => new Date(Date.UTC(2026, 9, 1, h, m)).toISOString();
    const days = (timeZone: string) =>
      skillMastery(facts({ timeZone, retests: [{ ...retest('q1', true, 0), at: lateUtc(22, 0) }, { ...retest('q1', true, 0), at: lateUtc(23, 30) }] }), 'chart_reading').evidence.retests;
    expect(days('UTC')).toBe(1);
    expect(days('Africa/Lagos')).toBe(2);
  });

  it('counts distinct questions for Secure: re-testing one question repeatedly is not ten items', () => {
    const answers = [1, 2, 3, 4, 5].map((i) => answer(`c${i}`, true, i * 30, ['chart_reading'], `m${i}`));
    const sameQuestion = facts({ answers, retests: [0, 1, 2, 3, 4].map((d) => retest('c1', true, 200 + d * 30)) });
    expect(skillMastery(sameQuestion, 'chart_reading').level).toBe('practising');
    const different = facts({ answers, retests: [1, 2, 3, 4, 5].map((i) => retest(`c${i}`, true, 200 + i * 30)) });
    expect(skillMastery(different, 'chart_reading').level).toBe('secure');
  });

  it('rewards breadth across contexts, not repetition of one', () => {
    const one = facts({ answers: [1, 2, 3].map((i) => answer(`q${i}`, true, i)) });
    const three = facts({ answers: [1, 2, 3].map((i) => answer(`q${i}`, true, i, ['chart_reading'], `m${i}`)) });
    expect(skillMastery(one, 'chart_reading').components.breadth).toBeCloseTo(1 / 3);
    expect(skillMastery(three, 'chart_reading').components.breadth).toBe(1);
  });

  it('scores rule-checked trades on process and reasoning, never on outcome', () => {
    const f = facts({ checkedTrades: [trade({}, 1), trade({ ruleBroken: true, hasRationale: false, reviewed: false }, 2)] });
    const m = skillMastery(f, 'execution_discipline');
    expect(m.components.application).toBe(0.5);
    expect(m.components.reasoning).toBe(0.5);
  });

  it('weighs hand-entered trades at half a paper trade', () => {
    const f = facts({ checkedTrades: [trade({ appVerified: true }, 1), trade({ appVerified: false, ruleBroken: true }, 2)] });
    // (1 × 1 + 0 × 0.5) / 1.5
    expect(skillMastery(f, 'risk_management').components.application).toBeCloseTo(2 / 3);
    const manual = facts({ checkedTrades: Array.from({ length: 8 }, (_, i) => trade({ appVerified: false }, i)) });
    expect(skillMastery(manual, 'risk_management').level).toBe('early');
  });

  it('gives no score from reasoning or breadth alone, and does not use journal reasons for psychology', () => {
    const f = facts({ checkedTrades: [trade()] });
    expect(skillMastery(f, 'psychology').score).toBeNull();
    expect(skillMastery(f, 'psychology').components.reasoning).toBeNull();
    // Execution discipline has trades as application evidence, so it does get a score.
    expect(skillMastery(f, 'execution_discipline').score).not.toBeNull();
  });

  it('maps replays, labs, psychology and strategy exercises to their skills', () => {
    const f = facts({
      replays: [{ scenarioKind: 'range', processScore: 0.5, at: at(1) }, { scenarioKind: 'range', processScore: null, at: at(2) }],
      labs: [{ kind: 'scenario', refId: 's1', score: 0.2, at: at(1) }, { kind: 'scenario', refId: 's1', score: 0.8, at: at(2) }],
      psych: [{ scenarioId: 'p1', quality: 'mixed', at: at(1) }],
      strategyExercises: [{ strategyId: 'st', skills: ['strategy_understanding'], score: 1, at: at(1) }],
    });
    expect(skillMastery(f, 'execution_discipline').components.application).toBe(0.5);
    expect(skillMastery(f, 'fundamental_analysis').components.application).toBe(0.8);
    expect(skillMastery(f, 'psychology').components.application).toBe(0.5);
    expect(skillMastery(f, 'strategy_understanding').components.application).toBe(1);
  });

  it('levels need enough items and two kinds of evidence to be secure', () => {
    expect(levelFor(null, 0, 0)).toBe('no_evidence');
    expect(levelFor(1, 4, 1)).toBe('early');
    expect(levelFor(0.5, 6, 1)).toBe('developing');
    expect(levelFor(0.7, 6, 1)).toBe('practising');
    expect(levelFor(0.9, 12, 1)).toBe('practising');
    expect(levelFor(0.9, 12, 2)).toBe('secure');
  });

  it('summarises the evidence in plain words', () => {
    expect(evidenceSummary({ answers: 1, exercises: 0, retests: 0, trades: 0 })).toBe('Based on 1 answer.');
    expect(evidenceSummary({ answers: 12, exercises: 5, retests: 3, trades: 0 })).toBe('Based on 12 answers, 5 exercises and 3 re-tests.');
  });
});
