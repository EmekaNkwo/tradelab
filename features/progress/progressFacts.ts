import type { ContentRepository } from '../../data';
import { processScore } from '../../domain/journal/processScore';
import { gradeQuestion } from '../../domain/learning/assessment';
import { localDateIn, type LocalDate } from '../../domain/learning/dates';
import { decodeReviewAnswer } from '../../domain/learning/spacedRepetition';
import type { JournalEntry, JournalReview, PsychAttempt } from '../../domain/models/journal';
import { activityDate, RULE_CHECKED_SOURCES } from '../../domain/models/journal';
import type { LabAttempt } from '../../domain/models/labs';
import type { DailyClass, QuizAttempt } from '../../domain/models/learning';
import type { DrillAttempt, ReplayAttempt } from '../../domain/models/practice';
import type { AnswerRecord, CheckedTradeRecord, ProgressFacts, RetestRecord } from '../../domain/progress';
import { strategyCompletion, type StrategyAttempt } from '../../domain/strategies';

/**
 * Turns stored records into the facts progress may use (spec §23, §29).
 * Only the fields listed in `RECORD_FIELDS` are copied across: profit, size,
 * balances and leverage stay behind, so no score or award can read them.
 */

export type ProgressContent = Pick<ContentRepository, 'question' | 'questionInfo' | 'modules' | 'module' | 'strategies' | 'traders' | 'program'>;

export interface ProgressActivity {
  readonly quizAttempts: readonly QuizAttempt[];
  readonly drillAttempts: readonly DrillAttempt[];
  readonly labAttempts: readonly LabAttempt[];
  readonly replays: readonly ReplayAttempt[];
  readonly journal: readonly JournalEntry[];
  readonly psych: readonly PsychAttempt[];
  readonly backtests: readonly { readonly inputs: { readonly split: { readonly kind: string } }; readonly createdAt: string }[];
  readonly completedMtTaskIds: ReadonlySet<string>;
  readonly classes: readonly DailyClass[];
  readonly completedUnitIds: ReadonlySet<string>;
  readonly programId: string | null;
  readonly timeZone: string;
  /** The learner's per-trade risk limit (% of equity), to check every rule-checked trade's planned risk. */
  readonly riskLimitPercent: number;
}

/** The shortest text that counts as a written reason or reflection, not a placeholder. */
export const SUBSTANTIAL_TEXT = 20;
const substantial = (text: string | null | undefined) => (text ?? '').trim().length >= SUBSTANTIAL_TEXT;

/** A review with substance: at least two parts filled in, one of them a sentence or more. */
export function substantialReview(r: JournalReview | null): boolean {
  if (!r) return false;
  const parts = [r.thesis, r.planVsActual, r.resultNote, r.lesson, r.nextGoal];
  return parts.filter((p) => p.trim() !== '').length >= 2 && parts.some(substantial);
}

/** Strategy knowledge checks are stored as "questionId=optionId" entries. */
function decodeAnswers(picked: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of picked) {
    const i = p.indexOf('=');
    if (i <= 0) continue;
    const q = p.slice(0, i);
    out[q] = [...(out[q] ?? []), p.slice(i + 1)];
  }
  return out;
}

function answerRecords(content: ProgressContent, a: ProgressActivity): { answers: AnswerRecord[]; retests: RetestRecord[] } {
  const answers: AnswerRecord[] = [];
  const retests: RetestRecord[] = [];
  const grade = (questionId: string, chosen: readonly string[], at: string, fallbackContext: string) => {
    const question = content.question(questionId);
    const info = content.questionInfo(questionId);
    if (!question || !info) return;
    const contextId = info.moduleId ?? info.strategyId ?? fallbackContext;
    answers.push({ questionId, skills: info.skills, lessonId: info.lessonId, contextId, correct: gradeQuestion(question, chosen).correct, at });
  };
  for (const attempt of a.quizAttempts) {
    for (const [questionId, chosen] of Object.entries(attempt.answers)) {
      if (attempt.kind === 'review') {
        const info = content.questionInfo(questionId);
        if (info) retests.push({ questionId, skills: info.skills, ...decodeReviewAnswer(chosen), at: attempt.createdAt });
      } else grade(questionId, chosen, attempt.createdAt, attempt.refId);
    }
  }
  for (const l of a.labAttempts) {
    if (l.kind !== 'strategy_check') continue;
    for (const [questionId, chosen] of Object.entries(decodeAnswers(l.picked))) grade(questionId, chosen, l.answeredAt, l.refId);
  }
  return { answers, retests };
}

/**
 * A rule-checked trade as progress sees it. The planned risk is checked
 * against the learner's limit here too, because a hand-entered trade never
 * went through the paper simulator's rule check.
 */
export function checkedTrade(e: JournalEntry, riskLimitPercent: number): CheckedTradeRecord {
  const riskOverLimit = processScore(e, riskLimitPercent).checks.some((c) => c.id === 'risk_within_limit' && c.passed === false);
  return {
    ruleBroken: e.ruleViolations.length > 0 || riskOverLimit,
    hasStop: e.stop !== null && e.stop.trim() !== '',
    hasRationale: substantial(e.entryRationale),
    emotionRated: e.emotion !== null,
    reviewed: substantialReview(e.review),
    appVerified: e.source === 'paper',
    at: activityDate(e),
  };
}

function strategyFacts(content: ProgressContent, labs: readonly LabAttempt[]) {
  const attempts: StrategyAttempt[] = labs.flatMap((l) => (l.kind === 'strategy_check' || l.kind === 'strategy_exercise' ? [{ kind: l.kind, refId: l.refId, score: l.score }] : []));
  const completed = new Set(content.strategies().filter((s) => strategyCompletion(s, attempts).complete).map((s) => s.id));
  const skills = new Map(content.strategies().map((s) => [s.id, s.skills]));
  const exercises = labs.flatMap((l) => {
    const s = l.kind === 'strategy_exercise' ? skills.get(l.refId) : undefined;
    return s ? [{ strategyId: l.refId, skills: s, score: l.score, at: l.answeredAt }] : [];
  });
  // Only reviewed trader pages ship (spec §15.1), so every trader here is reviewed content.
  const tradersStudied = content.traders().filter((t) => t.strategyIds.length > 0 && t.strategyIds.every((id) => completed.has(id))).length;
  return { completed, exercises, tradersStudied };
}

function programProgress(content: ProgressContent, a: ProgressActivity): ProgressFacts['program'] {
  const program = a.programId ? content.program(a.programId) : null;
  if (!program) return null;
  const total = program.moduleIds.reduce((n, id) => n + (content.module(id)?.lessonIds.length ?? 0) + 1, 0);
  return { done: a.completedUnitIds.size, total };
}

export function progressFacts(content: ProgressContent, a: ProgressActivity): ProgressFacts {
  const { answers, retests } = answerRecords(content, a);
  const checkpointModule = new Map(content.modules().map((m) => [m.checkpointQuizId, m.id]));
  const strategies = strategyFacts(content, a.labAttempts);
  const classDates = a.classes.flatMap((c): LocalDate[] => (c.status === 'completed' && c.completedAt ? [localDateIn(new Date(c.completedAt), a.timeZone)] : []));
  return {
    answers,
    retests,
    drills: a.drillAttempts.map((d) => ({ kind: d.kind, correct: d.correct, at: d.answeredAt })),
    checkedTrades: a.journal.filter((e) => RULE_CHECKED_SOURCES.includes(e.source)).map((e) => checkedTrade(e, a.riskLimitPercent)),
    replays: a.replays.map((r) => ({ scenarioKind: r.scenarioKind, processScore: r.processScore, at: r.finishedAt })),
    labs: a.labAttempts.flatMap((l) => (l.kind === 'red_flag' || l.kind === 'scenario' ? [{ kind: l.kind, refId: l.refId, score: l.score, at: l.answeredAt }] : [])),
    strategyExercises: strategies.exercises,
    psych: a.psych.map((p) => ({ scenarioId: p.scenarioId, quality: p.quality, at: p.answeredAt })),
    backtests: a.backtests.map((b) => ({ testedOutOfSample: b.inputs.split.kind !== 'none', at: b.createdAt })),
    // A checkpoint passed in the placement quiz counts as passed.
    passedCheckpointModuleIds: new Set(
      a.quizAttempts.flatMap((q) => ((q.kind === 'checkpoint' || q.kind === 'placement') && q.passed ? [checkpointModule.get(q.refId) ?? ''] : [])).filter(Boolean),
    ),
    masteredLessonIds: new Set(a.quizAttempts.flatMap((q) => (q.kind === 'lesson_check' && q.passed ? [q.refId] : []))),
    completedStrategyIds: strategies.completed,
    tradersStudied: strategies.tradersStudied,
    completedMtTaskIds: a.completedMtTaskIds,
    classDates: [...new Set(classDates)],
    program: programProgress(content, a),
    timeZone: a.timeZone,
  };
}
