import { localDateIn, type LocalDate } from '../learning/dates';
import type { SkillId } from '../models/progress';

/**
 * What the learner actually did, reduced to the facts progress may use
 * (spec §23, §27, §29). Process over profit (spec §3.4): no record here has a
 * field for profit, balance, size or leverage, so nothing built from them can
 * reward those. `RECORD_FIELDS` lists every field, and a
 * test checks the list against these types and against banned names.
 */

/**
 * One answer to a question: from a lesson quick check, a checkpoint, the
 * placement quiz or a strategy knowledge check. Spaced re-tests are separate
 * (`RetestRecord`).
 */
export interface AnswerRecord {
  readonly questionId: string;
  readonly skills: readonly SkillId[];
  readonly lessonId: string | null;
  /** Where it was asked: a module or strategy id, for breadth. */
  readonly contextId: string;
  readonly correct: boolean;
  readonly at: string;
}

/** A spaced re-test of an earlier question (warm-up or review session). */
export interface RetestRecord {
  readonly questionId: string;
  readonly skills: readonly SkillId[];
  readonly correct: boolean;
  /** False when the item was brought forward before its schedule: practice, not retention evidence. */
  readonly genuinelyDue: boolean;
  readonly at: string;
}

export interface DrillRecord {
  readonly kind: string;
  readonly correct: boolean;
  readonly at: string;
}

/** A trade checked against the learner's own risk rules (paper or hand-entered demo). */
export interface CheckedTradeRecord {
  /** A risk rule was broken, or the planned risk was over the learner's per-trade limit. */
  readonly ruleBroken: boolean;
  readonly hasStop: boolean;
  /** An entry reason of real substance was written (see the journal-facts thresholds). */
  readonly hasRationale: boolean;
  readonly emotionRated: boolean;
  /** A journal review of real substance was written. */
  readonly reviewed: boolean;
  /** Placed in the paper simulator, so the app saw the stop and rule check itself; false for hand-entered trades. */
  readonly appVerified: boolean;
  readonly at: string;
}

/** Clean: a stop was set, no rule was broken and the risk was within the limit. Results never count. */
export const isCleanTrade = (t: CheckedTradeRecord): boolean => t.hasStop && !t.ruleBroken;

export interface ReplayRecord {
  readonly scenarioKind: string;
  /** Share of trades with a stop from the start and risk within the limit; null with no trades. */
  readonly processScore: number | null;
  readonly at: string;
}

export interface LabCaseRecord {
  readonly kind: 'red_flag' | 'scenario';
  readonly refId: string;
  readonly score: number;
  readonly at: string;
}

export interface StrategyExerciseRecord {
  readonly strategyId: string;
  readonly skills: readonly SkillId[];
  readonly score: number;
  readonly at: string;
}

export interface PsychRecord {
  readonly scenarioId: string;
  readonly quality: 'helpful' | 'mixed' | 'harmful';
  readonly at: string;
}

export interface BacktestRecord {
  /** The run kept an out-of-sample part or period blocks. */
  readonly testedOutOfSample: boolean;
  readonly at: string;
}

export interface ProgramProgressRecord {
  readonly done: number;
  readonly total: number;
}

export interface ProgressFacts {
  readonly answers: readonly AnswerRecord[];
  readonly retests: readonly RetestRecord[];
  readonly drills: readonly DrillRecord[];
  readonly checkedTrades: readonly CheckedTradeRecord[];
  readonly replays: readonly ReplayRecord[];
  readonly labs: readonly LabCaseRecord[];
  readonly strategyExercises: readonly StrategyExerciseRecord[];
  readonly psych: readonly PsychRecord[];
  readonly backtests: readonly BacktestRecord[];
  readonly passedCheckpointModuleIds: ReadonlySet<string>;
  readonly masteredLessonIds: ReadonlySet<string>;
  readonly completedStrategyIds: ReadonlySet<string>;
  /** Reviewed traders whose strategy pages are all complete (spec §15.1: reviewed content only). */
  readonly tradersStudied: number;
  readonly completedMtTaskIds: ReadonlySet<string>;
  /** Local dates on which a class was completed. */
  readonly classDates: readonly LocalDate[];
  readonly program: ProgramProgressRecord | null;
  /** The learner's time zone, for anything counted per day. */
  readonly timeZone: string;
}

export type FactName = keyof ProgressFacts;

/** The record type of a fact: the element of a list, or the object itself. Sets, dates and scalars have no record. */
type RecordOf<T> = T extends readonly (infer E)[] ? E : T extends ReadonlySet<unknown> ? never : T;
type FieldsOf<K extends FactName> = RecordOf<NonNullable<ProgressFacts[K]>> extends infer R ? ([R] extends [never] ? string : R extends string | number | boolean ? string : keyof R & string) : never;

/**
 * Every field each fact holds, used by the process-over-profit sweep test.
 * For record lists it is typed against the record, so a field cannot be added
 * to a record without being listed (the test also checks the list is complete).
 */
export const RECORD_FIELDS: { readonly [K in FactName]: readonly FieldsOf<K>[] } = {
  answers: ['questionId', 'skills', 'lessonId', 'contextId', 'correct', 'at'],
  retests: ['questionId', 'skills', 'correct', 'genuinelyDue', 'at'],
  drills: ['kind', 'correct', 'at'],
  checkedTrades: ['ruleBroken', 'hasStop', 'hasRationale', 'emotionRated', 'reviewed', 'appVerified', 'at'],
  replays: ['scenarioKind', 'processScore', 'at'],
  labs: ['kind', 'refId', 'score', 'at'],
  strategyExercises: ['strategyId', 'skills', 'score', 'at'],
  psych: ['scenarioId', 'quality', 'at'],
  backtests: ['testedOutOfSample', 'at'],
  passedCheckpointModuleIds: ['moduleId'],
  masteredLessonIds: ['lessonId'],
  completedStrategyIds: ['strategyId'],
  tradersStudied: ['count'],
  completedMtTaskIds: ['taskId'],
  classDates: ['date'],
  program: ['done', 'total'],
  timeZone: ['timeZone'],
};

/** Newest first, so "the last N" is a prefix. */
export const newestFirst = <T extends { readonly at: string }>(items: readonly T[]): T[] => [...items].sort((a, b) => b.at.localeCompare(a.at));

/** The latest record per key, newest first. */
export function latestBy<T extends { readonly at: string }>(items: readonly T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return newestFirst(items).filter((t) => {
    const k = key(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The learner's local date of a timestamp. */
export const dayOf = (facts: Pick<ProgressFacts, 'timeZone'>, at: string): LocalDate => localDateIn(new Date(at), facts.timeZone);

const DAY_MS = 86_400_000;

/**
 * Answers that count as evidence of understanding (spec §23): the first answer
 * to a question, or one given at least a day after the previous attempt at it.
 * A retake straight after seeing the feedback shows memory of the answer, not
 * understanding, so it is left out.
 */
export function spacedAnswers(answers: readonly AnswerRecord[]): AnswerRecord[] {
  const byQuestion = new Map<string, AnswerRecord[]>();
  for (const a of answers) byQuestion.set(a.questionId, [...(byQuestion.get(a.questionId) ?? []), a]);
  return [...byQuestion.values()].flatMap((list) => {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
    return sorted.filter((a, i) => {
      const previous = sorted[i - 1];
      return !previous || Date.parse(a.at) - Date.parse(previous.at) >= DAY_MS;
    });
  });
}

/** The latest counted answer to each question, newest first. */
export const latestAnswers = (answers: readonly AnswerRecord[]): AnswerRecord[] => latestBy(spacedAnswers(answers), (a) => a.questionId);

/**
 * Re-tests that count for retention and XP: only ones that were genuinely due
 * (not brought forward), and at most one per question per learner day (the
 * first that day).
 */
export function countedRetests(facts: Pick<ProgressFacts, 'retests' | 'timeZone'>): RetestRecord[] {
  const seen = new Set<string>();
  return [...facts.retests]
    .filter((r) => r.genuinelyDue)
    .sort((a, b) => a.at.localeCompare(b.at))
    .filter((r) => {
      const key = `${r.questionId}|${dayOf(facts, r.at)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export const share = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole);
