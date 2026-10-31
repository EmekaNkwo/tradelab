import { dec } from '../../shared/decimal';
import { RULE_CHECKED_SOURCES, type JournalEntry } from '../models/journal';

/**
 * Process score (spec §22, §3.4). It judges how the trade was run, never its
 * result: profit is not an input. A winning trade that broke rules scores
 * low; a losing trade that followed the plan can score full marks.
 */

export type ProcessCheckId = 'stop_set' | 'risk_within_limit' | 'no_rule_breaks' | 'followed_plan' | 'had_reason' | 'reviewed';

export interface ProcessCheck {
  readonly id: ProcessCheckId;
  readonly label: string;
  /** null when it cannot be judged yet (e.g. not reviewed, or the risk is unknown). */
  readonly passed: boolean | null;
}

export interface ProcessResult {
  readonly checks: readonly ProcessCheck[];
  /** Share of the checks that could be judged and passed (0–1); null if none could be judged. */
  readonly score: number | null;
}

type Scored = Pick<JournalEntry, 'source' | 'stop' | 'plannedRisk' | 'equityAtEntry' | 'ruleViolations' | 'entryRationale' | 'review'>;

export function processScore(e: Scored, riskLimitPercent: number): ProcessResult {
  const riskPercent = e.plannedRisk && e.equityAtEntry && dec(e.equityAtEntry).gt(0) ? dec(e.plannedRisk).div(e.equityAtEntry).times(100) : null;
  const checks: ProcessCheck[] = [
    { id: 'stop_set', label: 'A stop loss was set when the trade opened', passed: e.stop !== null },
    {
      id: 'risk_within_limit',
      label: `Planned risk was within your ${riskLimitPercent}% limit`,
      passed: riskPercent === null ? null : riskPercent.lte(riskLimitPercent),
    },
    {
      id: 'no_rule_breaks',
      label: 'No risk rule was broken',
      // Imports and replays never ran a rule check, so an empty list proves nothing.
      passed: RULE_CHECKED_SOURCES.includes(e.source) ? e.ruleViolations.length === 0 : null,
    },
    { id: 'had_reason', label: 'The entry reason was written down', passed: (e.entryRationale ?? '').trim().length > 0 },
    { id: 'followed_plan', label: 'You followed your plan', passed: e.review ? e.review.rulesFollowed : null },
    { id: 'reviewed', label: 'The trade was reviewed with a lesson', passed: e.review ? e.review.lesson.trim().length > 0 : false },
  ];
  const judged = checks.filter((c) => c.passed !== null);
  const score = judged.length === 0 ? null : judged.filter((c) => c.passed).length / judged.length;
  return { checks, score };
}
