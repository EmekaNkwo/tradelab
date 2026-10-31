import type { Challenge } from '../models/progress';
import { challengeProgress } from './challenges';
import type { SkillMastery } from './mastery';
import { countedRetests, dayOf, isCleanTrade, newestFirst, type FactName, type ProgressFacts } from './records';

/**
 * XP, badges and milestones (spec §29). They are derived from the records on
 * every read. The first time a challenge, badge or milestone is met it is
 * latched (stored with its date by the caller, see `newUnlocks`), so it stays
 * earned, with its XP, even if later records would no longer meet it.
 *
 * Process over profit (spec §3.4): nothing is awarded for trade results, size,
 * leverage or recovering losses, and XP never grows with the number of trades
 * placed: trade-based awards ask how trades were run and are one-off. Practice that could be repeated for
 * points (drills, spaced re-tests) is capped per learner day; journal reviews
 * earn one-off milestone XP (the first 5 and the first 20), never XP per trade.
 * `AWARD_SOURCES` declares which facts each award reads, and a test sweeps them
 * against banned fields.
 */

export const XP = {
  masteredLesson: 10,
  passedCheckpoint: 30,
  completedClass: 5,
  correctRetest: 2,
  correctDrill: 3,
  goodLabCase: 5,
  completedStrategy: 20,
  reviewMilestone: 25,
  completedChallenge: 50,
} as const;

/** Most correct drills that earn XP on one learner day. */
export const DAILY_DRILL_XP_CAP = 10;
/** Most counted spaced re-tests that earn XP on one learner day. */
export const DAILY_RETEST_XP_CAP = 10;
/** Reviewed-trade counts that reach a one-off milestone. */
export const REVIEW_MILESTONES = [5, 20] as const;
export const GOOD_LAB_SCORE = 0.8;

export type XpSource = keyof typeof XP;

export const XP_SOURCE_LABELS: Readonly<Record<XpSource, string>> = {
  masteredLesson: 'Lessons mastered',
  passedCheckpoint: 'Checkpoints passed',
  completedClass: 'Classes completed',
  correctRetest: 'Spaced reviews answered right',
  correctDrill: 'Drills answered right',
  goodLabCase: 'Lab cases judged well',
  completedStrategy: 'Strategy pages completed',
  reviewMilestone: 'Journal review milestones',
  completedChallenge: 'Challenges completed',
};

export const BADGE_IDS = [
  'chart_reader',
  'risk_foundations',
  'disciplined_simulator',
  'backtesting_researcher',
  'journal_reviewer',
  'famous_traders_researcher',
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

/** Which facts each award reads. Badges that need skill mastery read the facts mastery reads. */
export const AWARD_SOURCES: Readonly<Record<XpSource | BadgeId | 'milestones', readonly FactName[]>> = {
  masteredLesson: ['masteredLessonIds'],
  passedCheckpoint: ['passedCheckpointModuleIds'],
  completedClass: ['classDates'],
  correctRetest: ['retests', 'timeZone'],
  correctDrill: ['drills', 'timeZone'],
  goodLabCase: ['labs'],
  completedStrategy: ['completedStrategyIds'],
  reviewMilestone: ['checkedTrades'],
  completedChallenge: ['passedCheckpointModuleIds', 'answers', 'drills', 'checkedTrades', 'replays', 'labs', 'completedStrategyIds', 'backtests', 'completedMtTaskIds', 'tradersStudied'],
  chart_reader: ['answers', 'drills', 'labs', 'strategyExercises', 'retests'],
  risk_foundations: ['passedCheckpointModuleIds', 'answers', 'drills', 'labs', 'replays', 'checkedTrades', 'retests'],
  disciplined_simulator: ['checkedTrades'],
  backtesting_researcher: ['passedCheckpointModuleIds', 'backtests'],
  journal_reviewer: ['checkedTrades'],
  famous_traders_researcher: ['tradersStudied'],
  milestones: ['program', 'passedCheckpointModuleIds', 'classDates', 'checkedTrades'],
};

export interface XpLine {
  readonly source: XpSource;
  readonly count: number;
  readonly xp: number;
}

export interface Badge {
  readonly id: BadgeId;
  readonly title: string;
  readonly how: string;
  readonly earned: boolean;
  /** When it was first earned, once latched. */
  readonly earnedAt: string | null;
}

export interface Milestone {
  readonly id: string;
  readonly title: string;
  readonly reached: boolean;
  readonly reachedAt: string | null;
}

export type AwardKind = 'challenge' | 'badge' | 'milestone';

/** The stored key of a latched award: "challenge:risk-management", "badge:chart_reader"… */
export const awardKey = (kind: AwardKind, id: string): string => `${kind}:${id}`;

export interface Awards {
  readonly xp: number;
  readonly lines: readonly XpLine[];
  readonly badges: readonly Badge[];
  readonly milestones: readonly Milestone[];
  /** Challenge ids completed now or earlier, with the date first completed when latched. */
  readonly completedChallenges: ReadonlyMap<string, string | null>;
  /** Awards met now that are not latched yet; the caller stores them with today's date. */
  readonly newUnlocks: readonly { readonly kind: AwardKind; readonly id: string }[];
}

export interface AwardInput {
  readonly facts: ProgressFacts;
  readonly mastery: readonly SkillMastery[];
  readonly challenges: readonly Challenge[];
  /** False while no famous-trader page has passed human review: that badge is not shown (spec §15.1). */
  readonly tradersAvailable: boolean;
  /** Latched awards: award key → when first unlocked. */
  readonly unlocked: ReadonlyMap<string, string>;
}

/** Items counted at most `cap` per learner day. */
function cappedPerDay<T extends { readonly at: string }>(facts: ProgressFacts, items: readonly T[], cap: number): number {
  const perDay = new Map<string, number>();
  for (const i of items) {
    const day = dayOf(facts, i.at);
    perDay.set(day, Math.min(cap, (perDay.get(day) ?? 0) + 1));
  }
  return [...perDay.values()].reduce((a, b) => a + b, 0);
}

export const RISK_CHECKPOINT_MODULE = 'forex-risk';
/** Each program's honest-testing module; either checkpoint counts. */
export const BACKTEST_CHECKPOINT_MODULES: readonly string[] = ['forex-backtest-plan', 'ta-advanced'];
export const DISCIPLINED_TRADES = 10;
export const JOURNAL_REVIEWS = 5;
export const TRADERS_STUDIED = 3;

function xpCounts(input: AwardInput, completedChallenges: number, reviewMilestones: number): Readonly<Record<XpSource, number>> {
  const f = input.facts;
  const bestLab = new Map<string, number>();
  for (const l of f.labs) bestLab.set(`${l.kind}:${l.refId}`, Math.max(bestLab.get(`${l.kind}:${l.refId}`) ?? 0, l.score));
  return {
    masteredLesson: f.masteredLessonIds.size,
    passedCheckpoint: f.passedCheckpointModuleIds.size,
    completedClass: f.classDates.length,
    correctRetest: cappedPerDay(
      f,
      countedRetests(f).filter((r) => r.correct),
      DAILY_RETEST_XP_CAP,
    ),
    correctDrill: cappedPerDay(
      f,
      f.drills.filter((d) => d.correct),
      DAILY_DRILL_XP_CAP,
    ),
    goodLabCase: [...bestLab.values()].filter((s) => s >= GOOD_LAB_SCORE).length,
    completedStrategy: f.completedStrategyIds.size,
    reviewMilestone: reviewMilestones,
    completedChallenge: completedChallenges,
  };
}

const levelOf = (mastery: readonly SkillMastery[], skill: SkillMastery['skill']) => mastery.find((m) => m.skill === skill)?.level ?? 'no_evidence';

type BadgeRule = Omit<Badge, 'earnedAt'>;

function badgeRules(input: AwardInput): BadgeRule[] {
  const f = input.facts;
  const lastPaperTrades = newestFirst(f.checkedTrades.filter((t) => t.appVerified)).slice(0, DISCIPLINED_TRADES);
  const all: BadgeRule[] = [
    { id: 'chart_reader', title: 'Chart Reader', how: 'Reach "Secure" in chart reading.', earned: levelOf(input.mastery, 'chart_reading') === 'secure' },
    {
      id: 'risk_foundations',
      title: 'Risk Foundations',
      how: 'Pass the Risk checkpoint and reach "Practising" or better in risk management.',
      earned: f.passedCheckpointModuleIds.has(RISK_CHECKPOINT_MODULE) && ['practising', 'secure'].includes(levelOf(input.mastery, 'risk_management')),
    },
    {
      id: 'disciplined_simulator',
      title: 'Disciplined Simulator',
      how: `Your last ${DISCIPLINED_TRADES} paper trades were each clean: a stop set, no rule broken and risk within your limit. Only paper trades count, because the app checked them itself; hand-entered trades and the results of any trade do not.`,
      earned: lastPaperTrades.length === DISCIPLINED_TRADES && lastPaperTrades.every(isCleanTrade),
    },
    {
      id: 'backtesting_researcher',
      title: 'Backtesting Researcher',
      how: "Pass your program's testing checkpoint (Backtesting my plan, or Regimes, sizing and honest testing) and save a backtest with an out-of-sample test.",
      earned: BACKTEST_CHECKPOINT_MODULES.some((id) => f.passedCheckpointModuleIds.has(id)) && f.backtests.some((b) => b.testedOutOfSample),
    },
    {
      id: 'journal_reviewer',
      title: 'Journal Reviewer',
      how: `Write a full journal review (at least two parts filled in, one in a sentence or more) for ${JOURNAL_REVIEWS} rule-checked trades.`,
      earned: f.checkedTrades.filter((t) => t.reviewed).length >= JOURNAL_REVIEWS,
    },
    {
      id: 'famous_traders_researcher',
      title: 'Famous Traders Researcher',
      how: `Complete the strategy pages of ${TRADERS_STUDIED} reviewed famous traders.`,
      earned: f.tradersStudied >= TRADERS_STUDIED,
    },
  ];
  return input.tradersAvailable ? all : all.filter((b) => b.id !== 'famous_traders_researcher');
}

export const MILESTONE_SHARES = [0.25, 0.5, 0.75, 1] as const;

type MilestoneRule = Omit<Milestone, 'reachedAt'>;

function milestoneRules(f: ProgressFacts): MilestoneRule[] {
  const p = f.program;
  const share = p && p.total > 0 ? p.done / p.total : 0;
  const reviewed = f.checkedTrades.filter((t) => t.reviewed).length;
  return [
    { id: 'first_class', title: 'First class completed', reached: f.classDates.length > 0 },
    { id: 'first_checkpoint', title: 'First checkpoint passed', reached: f.passedCheckpointModuleIds.size > 0 },
    ...MILESTONE_SHARES.map((s) => ({
      id: `program_${s * 100}`,
      title: s === 1 ? 'Program finished' : `${s * 100}% of the program done`,
      reached: p !== null && share >= s,
    })),
    ...REVIEW_MILESTONES.map((n) => ({ id: `reviews_${n}`, title: `First ${n} trades reviewed`, reached: reviewed >= n })),
  ];
}

export function awards(input: AwardInput): Awards {
  const latched = (kind: AwardKind, id: string) => input.unlocked.get(awardKey(kind, id)) ?? null;
  const fresh: { kind: AwardKind; id: string }[] = [];
  const settle = (kind: AwardKind, id: string, metNow: boolean) => {
    const at = latched(kind, id);
    if (metNow && at === null) fresh.push({ kind, id });
    return { met: metNow || at !== null, at };
  };

  const badges = badgeRules(input).map((b) => {
    const s = settle('badge', b.id, b.earned);
    return { ...b, earned: s.met, earnedAt: s.at };
  });
  const milestones = milestoneRules(input.facts).map((m) => {
    const s = settle('milestone', m.id, m.reached);
    return { ...m, reached: s.met, reachedAt: s.at };
  });
  const completedChallenges = new Map(
    input.challenges.flatMap((c) => {
      const s = settle('challenge', c.id, challengeProgress(c, input.facts).completed);
      return s.met ? [[c.id, s.at] as const] : [];
    }),
  );
  const reviewMilestones = milestones.filter((m) => m.id.startsWith('reviews_') && m.reached).length;
  const counts = xpCounts(input, completedChallenges.size, reviewMilestones);
  const lines = (Object.keys(XP) as XpSource[]).map((source) => ({ source, count: counts[source], xp: counts[source] * XP[source] }));
  return { xp: lines.reduce((s, l) => s + l.xp, 0), lines, badges, milestones, completedChallenges, newUnlocks: fresh };
}
