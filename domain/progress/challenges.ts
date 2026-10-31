import type { Challenge, ChallengeCriterion, ChallengeDimension } from '../models/progress';
import { isCleanTrade, latestAnswers, latestBy, newestFirst, type ProgressFacts } from './records';

/**
 * Challenges (spec §27), checked against the learner's real records. Every
 * criterion measures understanding, risk control, consistency, reasoning,
 * rule use or awareness of uncertainty; none looks at simulated profit.
 */

export interface CriterionProgress {
  readonly criterion: ChallengeCriterion;
  /** Progress towards the target, never above it. */
  readonly current: number;
  readonly target: number;
  readonly met: boolean;
  /** What is counted, in plain words ("7 of your last 10 right"). */
  readonly detail: string;
}

export interface ChallengeProgress {
  readonly challenge: Challenge;
  readonly criteria: readonly CriterionProgress[];
  readonly completed: boolean;
  /** Met criteria over all criteria, 0–1. */
  readonly progress: number;
  /** Each dimension the challenge assesses, and whether all its criteria are met. */
  readonly dimensions: readonly { readonly dimension: ChallengeDimension; readonly met: boolean }[];
}

const progressOf = (criterion: ChallengeCriterion, current: number, target: number, detail: string): CriterionProgress => ({
  criterion,
  current: Math.min(current, target),
  target,
  met: current >= target,
  detail,
});

/** The last `count` items, met when there are `count` of them and enough are right. */
function lastN(criterion: ChallengeCriterion, results: readonly boolean[], count: number, accuracy: number): CriterionProgress {
  const last = results.slice(0, count);
  const right = last.filter(Boolean).length;
  const needed = Math.ceil(count * accuracy - 1e-9);
  const detail = last.length < count ? `${last.length} of ${count} attempts so far, ${right} right` : `${right} of your last ${count} right (need ${needed})`;
  return { criterion, current: Math.min(right, needed), target: needed, met: last.length >= count && right >= needed, detail };
}

export function criterionProgress(c: ChallengeCriterion, facts: ProgressFacts): CriterionProgress {
  switch (c.kind) {
    case 'checkpoint_passed': {
      const passed = [c.moduleId, ...(c.orModuleIds ?? [])].some((id) => facts.passedCheckpointModuleIds.has(id));
      return progressOf(c, passed ? 1 : 0, 1, passed ? 'Passed' : 'Not passed yet');
    }
    case 'skill_questions': {
      const latest = latestAnswers(facts.answers.filter((a) => a.skills.includes(c.skill)));
      const right = latest.filter((a) => a.correct).length;
      const needed = Math.ceil(c.count * c.accuracy - 1e-9);
      const met = latest.length >= c.count && right / latest.length >= c.accuracy;
      return { criterion: c, current: Math.min(latest.length, c.count), target: c.count, met, detail: `${latest.length} answered, ${right} right (need ${c.count} at ${Math.round(c.accuracy * 100)}%, so at least ${needed} right)` };
    }
    case 'drill':
      return lastN(
        c,
        newestFirst(facts.drills.filter((d) => d.kind === c.drillKind)).map((d) => d.correct),
        c.count,
        c.accuracy,
      );
    case 'clean_trades': {
      // Only paper trades: the app placed them, so it saw the stop and the rule check itself.
      const last = newestFirst(facts.checkedTrades.filter((t) => t.appVerified)).slice(0, c.count);
      const brokenAt = last.findIndex((t) => !isCleanTrade(t));
      const clean = brokenAt === -1 ? last.length : brokenAt;
      return progressOf(
        c,
        clean,
        c.count,
        brokenAt === -1 ? `${clean} clean paper trades in a row` : `${clean} clean since the last paper trade that broke a rule, risked too much or had no stop`,
      );
    }
    case 'reviewed_trades': {
      const n = facts.checkedTrades.filter((t) => t.reviewed).length;
      return progressOf(c, n, c.count, `${n} reviewed`);
    }
    case 'replays': {
      const good = facts.replays.filter((r) => r.processScore !== null && r.processScore >= c.minProcessScore);
      const conditions = new Set(good.map((r) => r.scenarioKind)).size;
      const met = good.length >= c.count && conditions >= c.conditions;
      return { criterion: c, current: Math.min(good.length, c.count), target: c.count, met, detail: `${good.length} replays at this standard, in ${conditions} of ${c.conditions} conditions` };
    }
    case 'lab_cases': {
      // The latest attempt at each case counts, so an early good score is not kept after a later poor one.
      const latest = latestBy(
        facts.labs.filter((x) => x.kind === c.labKind),
        (l) => l.refId,
      );
      const n = latest.filter((l) => l.score >= c.minScore).length;
      return progressOf(c, n, c.count, `${n} cases at ${Math.round(c.minScore * 100)}% or better on your latest try`);
    }
    case 'strategies_completed':
      return progressOf(c, facts.completedStrategyIds.size, c.count, `${facts.completedStrategyIds.size} completed`);
    case 'backtests_tested_out_of_sample': {
      const n = facts.backtests.filter((b) => b.testedOutOfSample).length;
      return progressOf(c, n, c.count, `${n} saved with an out-of-sample test`);
    }
    case 'mt_tasks': {
      const n = c.taskIds.filter((id) => facts.completedMtTaskIds.has(id)).length;
      return progressOf(c, n, c.taskIds.length, `${n} of ${c.taskIds.length} confirmed by you`);
    }
    case 'traders_studied':
      return progressOf(c, facts.tradersStudied, c.count, `${facts.tradersStudied} studied`);
  }
}

export function challengeProgress(challenge: Challenge, facts: ProgressFacts): ChallengeProgress {
  const criteria = challenge.criteria.map((c) => criterionProgress(c, facts));
  const met = criteria.filter((c) => c.met).length;
  const dims = [...new Set(challenge.criteria.map((c) => c.dimension))];
  return {
    challenge,
    criteria,
    completed: met === criteria.length,
    progress: criteria.length === 0 ? 0 : met / criteria.length,
    dimensions: dims.map((d) => ({ dimension: d, met: criteria.filter((c) => c.criterion.dimension === d).every((c) => c.met) })),
  };
}
