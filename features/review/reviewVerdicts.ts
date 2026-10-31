import type { ProgressReview } from '../../domain/review';

/** One area's verdict in plain words (brief §5.8). Counts from the review only: no "ready" label, no grade. */
export interface AreaVerdicts {
  readonly objectives: string;
  readonly calculations: string;
  readonly rules: string;
  readonly conditions: string;
  readonly gaps: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Text verdicts for each area of the Practice Progress Review, built from the review's own counts. */
export function areaVerdicts(review: ProgressReview): AreaVerdicts {
  const passed = review.objectives.filter((o) => o.checkpoint === 'passed').length;
  const answeredAreas = review.calculations.filter((c) => c.answered > 0);
  const correct = answeredAreas.reduce((n, c) => n + c.correct, 0);
  const answered = answeredAreas.reduce((n, c) => n + c.answered, 0);
  const practised = review.conditions.filter((c) => c.sessions > 0).length;
  const r = review.rules;
  return {
    objectives: `${passed} of ${plural(review.objectives.length, 'module checkpoint', 'module checkpoints')} passed so far.`,
    calculations:
      answered === 0
        ? 'No calculation questions answered yet.'
        : `${correct} of ${plural(answered, 'answer', 'answers')} correct, in ${answeredAreas.length} of ${plural(review.calculations.length, 'area', 'areas')}.`,
    rules: r.checkedTrades === 0 ? 'No checked trades yet.' : `${r.withoutBreaks} of ${plural(r.checkedTrades, 'checked trade', 'checked trades')} broke no rule.`,
    conditions: `${practised} of ${plural(review.conditions.length, 'market condition', 'market conditions')} practised.`,
    gaps: review.gaps.length === 0 ? 'No gaps found yet from your results.' : `${plural(review.gaps.length, 'thing', 'things')} to work on.`,
  };
}
