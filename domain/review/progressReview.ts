import type { Module, Question } from '../models/content';
import type { JournalEntry } from '../models/journal';
import { RULE_CHECKED_SOURCES } from '../models/journal';
import type { QuizAttempt } from '../models/learning';
import type { DrillAttempt } from '../models/practice';
import { ruleShortName } from '../risk/rules';

/**
 * Practice Progress Review (spec §28). A learning assessment built only from
 * what the learner did: checkpoints, practical tasks, calculation answers,
 * rule-following, and the range of practice conditions. Profit, balance and
 * expectancy are never inputs, and nothing here says the learner is "ready".
 */

export const PROGRESS_REVIEW_REMINDER =
  'Completing practice does not show that you are ready to trade real money. This review describes your learning; it is not a readiness check or a recommendation to trade.';

/** Share of correct answers below which an area is listed as a gap. */
export const GAP_THRESHOLD = 0.8;

export type CheckpointState = 'passed' | 'attempted' | 'not_attempted';

export interface ObjectiveStatus {
  readonly moduleId: string;
  readonly title: string;
  readonly practicalResult: string;
  readonly checkpoint: CheckpointState;
  readonly bestScore: number | null;
  /** True when every MetaTrader task the module's lessons use was completed; null when it has none. */
  readonly practicalDone: boolean | null;
}

export interface CalculationArea {
  readonly id: string;
  readonly label: string;
  readonly answered: number;
  readonly correct: number;
  /** null until something was answered. */
  readonly accuracy: number | null;
}

export interface RuleConsistency {
  /** Paper and hand-entered demo trades: the ones checked against rules. */
  readonly checkedTrades: number;
  readonly withoutBreaks: number;
  readonly withStop: number;
  readonly reviewed: number;
  readonly commonBreaks: readonly { readonly rule: string; readonly count: number }[];
}

export type ConditionId = 'trending' | 'ranging' | 'breakouts' | 'reversals' | 'high_volatility' | 'low_volatility' | 'news';

export interface ConditionPractice {
  readonly id: ConditionId;
  readonly label: string;
  readonly sessions: number;
}

export interface KnowledgeGap {
  readonly kind: 'checkpoint' | 'calculation' | 'condition' | 'rule';
  readonly reason: string;
  /** For a checkpoint, the module's lessons from the start; for a calculation, the lessons with a missed question. */
  readonly lessonIds: readonly string[];
  readonly drillKind: string | null;
}

export interface ProgressReview {
  readonly objectives: readonly ObjectiveStatus[];
  readonly calculations: readonly CalculationArea[];
  readonly rules: RuleConsistency;
  readonly conditions: readonly ConditionPractice[];
  readonly gaps: readonly KnowledgeGap[];
  readonly reminder: string;
}

/** Which scenario kinds count as practice in which market condition. */
export const CONDITION_KINDS: Readonly<Record<ConditionId, { readonly label: string; readonly kinds: readonly string[] }>> = {
  trending: { label: 'Trending markets', kinds: ['strong_uptrend', 'downtrend', 'pullback'] },
  ranging: { label: 'Ranges and sideways markets', kinds: ['range', 'sideways'] },
  breakouts: { label: 'Breakouts and false breakouts', kinds: ['breakout', 'false_breakout'] },
  reversals: { label: 'Reversals, crashes and recoveries', kinds: ['reversal', 'crash', 'recovery'] },
  high_volatility: { label: 'High volatility', kinds: ['high_volatility', 'crash'] },
  low_volatility: { label: 'Low volatility', kinds: ['low_volatility'] },
  news: { label: 'News events', kinds: ['news_shock'] },
};

/**
 * Calculation skills: the lessons whose quick checks are calculations, and
 * the drill that practises them. Checkpoints mix calculation with concepts,
 * so they are not counted here.
 */
export const CALCULATION_AREAS: readonly { readonly id: string; readonly label: string; readonly lessonIds: readonly string[]; readonly drillKind: string | null }[] = [
  { id: 'pips_margin', label: 'Pips, lots, pip value and margin', lessonIds: ['fx-lot-sizes', 'fx-pip-value', 'fx-leverage-margin', 'fx-margin-level'], drillKind: null },
  { id: 'risk_sizing', label: 'Position size, reward to risk and drawdown', lessonIds: ['fx-position-sizing', 'fx-rr-expectancy', 'fx-drawdown-ruin'], drillKind: 'size_it' },
];

export interface ProgressReviewInput {
  /** The program's modules, in order. */
  readonly modules: readonly Module[];
  /** MetaTrader task ids used by each module's lessons. */
  readonly moduleTasks: Readonly<Record<string, readonly string[]>>;
  /** Lesson id → module id, for lesson quick checks. */
  readonly lessonModule: Readonly<Record<string, string>>;
  /** Every question the app can ask, by id, to mark stored answers. */
  readonly questions: ReadonlyMap<string, Question>;
  readonly quizAttempts: readonly QuizAttempt[];
  readonly drillAttempts: readonly DrillAttempt[];
  readonly completedTaskIds: ReadonlySet<string>;
  /** Scenario kinds of finished replays and of paper accounts with at least one closed trade. */
  readonly practisedKinds: readonly string[];
  readonly journal: readonly JournalEntry[];
}

const sameSet = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
};

function objectives(input: ProgressReviewInput): readonly ObjectiveStatus[] {
  return input.modules.map((m) => {
    const tries = input.quizAttempts.filter((a) => a.kind === 'checkpoint' && a.refId === m.checkpointQuizId);
    const tasks = input.moduleTasks[m.id] ?? [];
    return {
      moduleId: m.id,
      title: m.title,
      practicalResult: m.practicalResult,
      checkpoint: tries.some((a) => a.passed) ? 'passed' : tries.length > 0 ? 'attempted' : 'not_attempted',
      bestScore: tries.length === 0 ? null : Math.max(...tries.map((a) => a.score)),
      practicalDone: tasks.length === 0 ? null : tasks.every((t) => input.completedTaskIds.has(t)),
    };
  });
}

interface Marked {
  readonly answered: number;
  readonly correct: number;
  /** Lessons with a question whose latest answer was wrong, in the area's order. */
  readonly missedLessonIds: readonly string[];
}

/** Marks the latest answer to each quick-check question from the given lessons, so a retake replaces an old mistake. */
function markLatest(input: ProgressReviewInput, lessonIds: readonly string[]): Marked {
  const latest = new Map<string, { readonly lessonId: string; readonly chosen: readonly string[] }>();
  const newestFirst = [...input.quizAttempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const a of newestFirst) {
    if (a.kind !== 'lesson_check' || !lessonIds.includes(a.refId)) continue;
    for (const [questionId, chosen] of Object.entries(a.answers)) {
      if (!latest.has(questionId) && input.questions.has(questionId)) latest.set(questionId, { lessonId: a.refId, chosen });
    }
  }
  const results = [...latest.entries()].map(([questionId, l]) => ({ lessonId: l.lessonId, right: sameSet(l.chosen, input.questions.get(questionId)!.correctOptionIds) }));
  const missed = new Set(results.filter((r) => !r.right).map((r) => r.lessonId));
  return { answered: results.length, correct: results.filter((r) => r.right).length, missedLessonIds: lessonIds.filter((id) => missed.has(id)) };
}

interface MarkedArea extends CalculationArea {
  readonly lessonIds: readonly string[];
  readonly drillKind: string | null;
}

function markedAreas(input: ProgressReviewInput): readonly MarkedArea[] {
  const areas = CALCULATION_AREAS.map((area): MarkedArea => {
    const m = markLatest(input, area.lessonIds);
    return { id: area.id, label: area.label, answered: m.answered, correct: m.correct, accuracy: m.answered === 0 ? null : m.correct / m.answered, lessonIds: m.missedLessonIds, drillKind: area.drillKind };
  });
  const sizeIt = input.drillAttempts.filter((d) => d.kind === 'size_it');
  const sizedRight = sizeIt.filter((d) => d.correct).length;
  const drill: MarkedArea = { id: 'size_it_drill', label: 'Size It drill', answered: sizeIt.length, correct: sizedRight, accuracy: sizeIt.length === 0 ? null : sizedRight / sizeIt.length, lessonIds: ['fx-position-sizing'], drillKind: 'size_it' };
  return [...areas, drill];
}

function rules(journal: readonly JournalEntry[]): RuleConsistency {
  const checked = journal.filter((e) => RULE_CHECKED_SOURCES.includes(e.source));
  const counts = new Map<string, number>();
  for (const rule of checked.flatMap((e) => e.ruleViolations)) counts.set(rule, (counts.get(rule) ?? 0) + 1);
  return {
    checkedTrades: checked.length,
    withoutBreaks: checked.filter((e) => e.ruleViolations.length === 0).length,
    withStop: checked.filter((e) => e.stop !== null).length,
    reviewed: checked.filter((e) => e.review !== null).length,
    commonBreaks: [...counts.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule)),
  };
}

function conditions(kinds: readonly string[]): readonly ConditionPractice[] {
  return (Object.keys(CONDITION_KINDS) as ConditionId[]).map((id) => ({
    id,
    label: CONDITION_KINDS[id].label,
    sessions: kinds.filter((k) => CONDITION_KINDS[id].kinds.includes(k)).length,
  }));
}

function gaps(input: ProgressReviewInput, objs: readonly ObjectiveStatus[], calcs: readonly MarkedArea[], conds: readonly ConditionPractice[], rule: RuleConsistency): readonly KnowledgeGap[] {
  const out: KnowledgeGap[] = [];
  for (const o of objs) {
    if (o.checkpoint === 'attempted') {
      const m = input.modules.find((x) => x.id === o.moduleId);
      out.push({ kind: 'checkpoint', reason: `Checkpoint not passed yet: ${o.title}`, lessonIds: m?.lessonIds ?? [], drillKind: null });
    }
  }
  for (const c of calcs) {
    if (c.accuracy === null || c.accuracy >= GAP_THRESHOLD) continue;
    out.push({ kind: 'calculation', reason: `${c.label}: ${c.correct} of ${c.answered} correct`, lessonIds: c.lessonIds, drillKind: c.drillKind });
  }
  for (const c of conds) {
    if (c.sessions === 0) out.push({ kind: 'condition', reason: `No practice yet in: ${c.label.toLowerCase()}`, lessonIds: [], drillKind: null });
  }
  const top = rule.commonBreaks[0];
  if (top && top.count >= 2) out.push({ kind: 'rule', reason: `A rule you break often: ${ruleShortName(top.rule)} (${top.count} times)`, lessonIds: [], drillKind: null });
  return out;
}

export function progressReview(input: ProgressReviewInput): ProgressReview {
  const objs = objectives(input);
  const calcs = markedAreas(input);
  const rule = rules(input.journal);
  const conds = conditions(input.practisedKinds);
  const calculations = calcs.map(({ id, label, answered, correct, accuracy }): CalculationArea => ({ id, label, answered, correct, accuracy }));
  return { objectives: objs, calculations, rules: rule, conditions: conds, gaps: gaps(input, objs, calcs, conds, rule), reminder: PROGRESS_REVIEW_REMINDER };
}
