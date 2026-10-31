import { addDays, localDateIn, type LocalDate, type Weekday } from '../../domain/learning/dates';
import type { JournalEntry, JournalSource } from '../../domain/models/journal';
import type { Challenge, SkillId } from '../../domain/models/progress';
import { summarise } from '../../domain/journal/summaries';
import { formatLocalDate } from '../learning';
import { weekComparison, weekStart, type WeekComparison } from './weekCompare';
import {
  allSkillMastery,
  awards,
  challengeProgress,
  newestFirst,
  recommendations,
  studyStreak,
  type Awards,
  type ChallengeProgress,
  type ProgressFacts,
  type Recommendation,
  type RecommendationContent,
  type SkillMastery,
  type Streak,
} from '../../domain/progress';

/**
 * The progress dashboard (spec §29). Learning performance (skills, quizzes,
 * drills, replay process, journal habits) is kept apart from simulated and
 * demo results, which are shown separately and feed no score or award.
 */

export const RECENT_LESSONS = 5;
export const DRILL_STATS_WINDOW = 20;

export interface DashboardContent extends RecommendationContent {
  moduleTitle(id: string): string | null;
  strategyCount(): number;
  challenges(): readonly Challenge[];
  tradersAvailable(): boolean;
}

export interface LearningStats {
  readonly checkpoints: readonly { readonly moduleId: string; readonly title: string; readonly passed: boolean }[];
  readonly lessonsMastered: number;
  readonly drills: readonly { readonly kind: string; readonly title: string; readonly right: number; readonly of: number }[];
  readonly replays: { readonly finished: number; readonly averageProcess: number | null; readonly conditions: number };
  readonly strategies: { readonly completed: number; readonly total: number };
  readonly backtests: { readonly saved: number; readonly outOfSample: number };
  readonly journal: { readonly checkedTrades: number; readonly reviewed: number; readonly withStop: number; readonly withoutBreaks: number; readonly commonBreaks: readonly { readonly rule: string; readonly count: number }[] };
  readonly recentLessons: readonly { readonly lessonId: string; readonly title: string; readonly at: string; readonly mastered: boolean }[];
}

export interface WeekStats {
  readonly from: LocalDate;
  readonly classes: number;
  readonly answers: number;
  readonly reviews: number;
  readonly drills: number;
  readonly replays: number;
}

/**
 * Simulated (replay, paper) and demo (manual, imported) trades, by source.
 * Never part of any score. Results in money stay in the journal, per source and
 * account, because they are not comparable across sources.
 */
export interface SimulatedResults {
  readonly bySource: readonly { readonly source: JournalSource; readonly trades: number }[];
}

export interface Dashboard {
  readonly mastery: readonly SkillMastery[];
  readonly recommendations: readonly Recommendation[];
  readonly challenges: readonly DashboardChallenge[];
  readonly awards: Awards;
  /** Null when the learner turned streaks off. */
  readonly streak: Streak | null;
  readonly learning: LearningStats;
  readonly week: WeekStats;
  /** This week against last week (Home's tiles). */
  readonly weekCompare: WeekComparison;
  readonly simulated: SimulatedResults;
  /** The learner's time zone, for showing award dates. */
  readonly timeZone: string;
}

/** "29 Oct 2026": the learner's local date of when an award was first earned. */
export const awardDate = (d: Pick<Dashboard, 'timeZone'>, at: string): string => formatLocalDate(localDateIn(new Date(at), d.timeZone));

export interface DashboardInput {
  readonly facts: ProgressFacts;
  readonly journal: readonly JournalEntry[];
  readonly today: LocalDate;
  /** The device clock, so this week so far is compared with the same point last week; whole days without it. */
  readonly now?: Date;
  readonly timeZone: string;
  readonly studyDays: readonly Weekday[];
  readonly streaks: boolean;
  /** Latched awards: award key → when first unlocked. */
  readonly unlocked: ReadonlyMap<string, string>;
}

/** A challenge's progress, completed for good once it was ever completed (latched). */
export interface DashboardChallenge extends ChallengeProgress {
  /** When it was first completed, once stored. */
  readonly completedAt: string | null;
}

function learningStats(content: DashboardContent, f: ProgressFacts, journal: readonly JournalEntry[]): LearningStats {
  const drillKinds = [...new Set(f.drills.map((d) => d.kind))];
  const scored = f.replays.filter((r) => r.processScore !== null);
  const checked = f.checkedTrades;
  const recent = newestFirst(f.answers.filter((a) => a.lessonId !== null));
  const seen = new Set<string>();
  const recentLessons = recent.flatMap((a) => {
    const id = a.lessonId as string;
    if (seen.has(id) || seen.size >= RECENT_LESSONS) return [];
    seen.add(id);
    return [{ lessonId: id, title: content.lessonTitle(id) ?? id, at: a.at, mastered: f.masteredLessonIds.has(id) }];
  });
  return {
    checkpoints: [...f.passedCheckpointModuleIds].map((id) => ({ moduleId: id, title: content.moduleTitle(id) ?? id, passed: true })),
    lessonsMastered: f.masteredLessonIds.size,
    drills: drillKinds.map((kind) => {
      const last = newestFirst(f.drills.filter((d) => d.kind === kind)).slice(0, DRILL_STATS_WINDOW);
      return { kind, title: content.drillTitle(kind), right: last.filter((d) => d.correct).length, of: last.length };
    }),
    replays: {
      finished: f.replays.length,
      averageProcess: scored.length === 0 ? null : scored.reduce((s, r) => s + (r.processScore ?? 0), 0) / scored.length,
      conditions: new Set(f.replays.map((r) => r.scenarioKind)).size,
    },
    strategies: { completed: f.completedStrategyIds.size, total: content.strategyCount() },
    backtests: { saved: f.backtests.length, outOfSample: f.backtests.filter((b) => b.testedOutOfSample).length },
    journal: {
      checkedTrades: checked.length,
      reviewed: checked.filter((t) => t.reviewed).length,
      withStop: checked.filter((t) => t.hasStop).length,
      withoutBreaks: checked.filter((t) => !t.ruleBroken).length,
      commonBreaks: summarise(journal, 'all').commonErrors.slice(0, 3),
    },
    recentLessons,
  };
}

export { weekStart };

function weekStats(f: ProgressFacts, today: LocalDate, timeZone: string): WeekStats {
  const from = weekStart(today);
  // Time zones are within a day of UTC, so anything before the day ahead of `from` in UTC is cheaply ruled out first.
  const earliest = addDays(from, -1);
  const inWeek = (at: string) => at.slice(0, 10) >= earliest && localDateIn(new Date(at), timeZone) >= from;
  return {
    from,
    classes: f.classDates.filter((d) => d >= from).length,
    answers: f.answers.filter((a) => inWeek(a.at)).length,
    reviews: f.retests.filter((r) => inWeek(r.at)).length,
    drills: f.drills.filter((d) => inWeek(d.at)).length,
    replays: f.replays.filter((r) => inWeek(r.at)).length,
  };
}

export function buildDashboard(content: DashboardContent, input: DashboardInput): Dashboard {
  const f = input.facts;
  const mastery = allSkillMastery(f);
  const challenges = content.challenges();
  const earned = awards({ facts: f, mastery, challenges, tradersAvailable: content.tradersAvailable(), unlocked: input.unlocked });
  return {
    mastery,
    recommendations: recommendations(f, mastery, content),
    challenges: challenges.map((c) => {
      const progress = challengeProgress(c, f);
      const done = earned.completedChallenges.has(c.id);
      return { ...progress, completed: done, completedAt: earned.completedChallenges.get(c.id) ?? null };
    }),
    awards: earned,
    streak: input.streaks ? studyStreak(f.classDates, input.studyDays, input.today) : null,
    learning: learningStats(content, f, input.journal),
    week: weekStats(f, input.today, input.timeZone),
    weekCompare: weekComparison(f, input.today, input.timeZone, input.now),
    simulated: { bySource: summarise(input.journal, 'all').bySource.map((s) => ({ source: s.source, trades: s.trades })) },
    timeZone: input.timeZone,
  };
}

export const skillOf = (d: Dashboard, id: SkillId): SkillMastery | null => d.mastery.find((m) => m.skill === id) ?? null;
