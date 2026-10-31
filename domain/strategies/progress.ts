import type { Strategy } from '../models/strategies';

/**
 * Completion of a strategy page (spec §15.3 item 14), from real attempts only:
 * the knowledge check passed at 80% or more, and the guided exercise (when the
 * page has one) judged 80% or more correct. Profit never counts (spec §3).
 */
export const STRATEGY_PASS_MARK = 0.8;

export interface StrategyAttempt {
  readonly kind: 'strategy_exercise' | 'strategy_check';
  readonly refId: string;
  readonly score: number;
}

export interface CompletionCriterion {
  readonly id: 'knowledge_check' | 'guided_exercise';
  readonly label: string;
  readonly met: boolean;
  /** Best score so far, or null when not tried. */
  readonly best: number | null;
}

export interface StrategyCompletion {
  readonly criteria: readonly CompletionCriterion[];
  readonly complete: boolean;
}

const best = (attempts: readonly StrategyAttempt[], kind: StrategyAttempt['kind'], strategyId: string): number | null => {
  const scores = attempts.filter((a) => a.kind === kind && a.refId === strategyId).map((a) => a.score);
  return scores.length === 0 ? null : Math.max(...scores);
};

export function strategyCompletion(strategy: Strategy, attempts: readonly StrategyAttempt[]): StrategyCompletion {
  const pct = `${Math.round(STRATEGY_PASS_MARK * 100)}%`;
  const checkBest = best(attempts, 'strategy_check', strategy.id);
  const criteria: CompletionCriterion[] = [
    { id: 'knowledge_check', label: `Pass the knowledge check with ${pct} or more`, met: checkBest !== null && checkBest >= STRATEGY_PASS_MARK, best: checkBest },
  ];
  if (strategy.exercise) {
    const exerciseBest = best(attempts, 'strategy_exercise', strategy.id);
    criteria.push({
      id: 'guided_exercise',
      label: `Judge ${pct} or more of the guided exercise correctly`,
      met: exerciseBest !== null && exerciseBest >= STRATEGY_PASS_MARK,
      best: exerciseBest,
    });
  }
  return { criteria, complete: criteria.every((c) => c.met) };
}

/** The guided exercise as judged options for `markPicks`. */
export function exerciseOptions(strategy: Strategy): readonly { readonly id: string; readonly expected: boolean }[] {
  return strategy.exercise ? strategy.exercise.options.map((o) => ({ id: o.id, expected: o.correct })) : [];
}

/** Knowledge-check answers stored as "questionId=optionId" entries in a lab attempt. */
export function encodeAnswers(answers: Readonly<Record<string, readonly string[]>>): readonly string[] {
  return Object.entries(answers).flatMap(([q, options]) => options.map((o) => `${q}=${o}`));
}
