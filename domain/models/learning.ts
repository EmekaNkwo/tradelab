import type { UtcIso } from '../../shared/time';
import type { LocalDate } from '../learning/dates';
import type { ClassStatus } from '../learning/progress';
import type { ClassKind, ScheduleSettings } from '../learning/scheduler';

/** Stored learning records (spec §6, §7, §33). */

export type EnrolmentStatus = 'active' | 'queued' | 'paused' | 'completed';

export interface Enrolment {
  readonly id: string;
  readonly programId: string;
  readonly status: EnrolmentStatus;
  readonly queuePosition: number;
  readonly settings: ScheduleSettings;
  /** "HH:MM" local time, or null when the learner chose no class time. */
  readonly classTime: string | null;
  readonly remindersEnabled: boolean;
  readonly createdAt: UtcIso;
  readonly updatedAt: UtcIso;
}

export interface DailyClass {
  readonly id: string;
  readonly enrolmentId: string;
  readonly index: number;
  readonly date: LocalDate;
  readonly kind: ClassKind;
  readonly moduleId: string | null;
  readonly unitIds: readonly string[];
  readonly minutes: number;
  readonly status: ClassStatus;
  readonly sectionsDone: number;
  readonly score: number | null;
  readonly startedAt: UtcIso | null;
  readonly completedAt: UtcIso | null;
}

export interface ClassNote {
  readonly id: string;
  readonly classId: string;
  readonly body: string;
  readonly createdAt: UtcIso;
}

export type QuizAttemptKind = 'lesson_check' | 'checkpoint' | 'review' | 'placement';

export interface QuizAttempt {
  readonly id: string;
  readonly kind: QuizAttemptKind;
  readonly refId: string;
  readonly answers: Readonly<Record<string, readonly string[]>>;
  readonly score: number;
  readonly passed: boolean;
  readonly createdAt: UtcIso;
}

/**
 * A guided MetaTrader task the learner says they finished (spec §14.3).
 * TradeLab cannot see inside MetaTrader, so this is always shown as
 * "confirmed by you", never as verified.
 */
export interface MetaTraderTaskCompletion {
  readonly id: string;
  readonly taskId: string;
  readonly platform: 'mt4' | 'mt5';
  /** When the learner confirmed "I'm on a demo account"; null for tasks that place no orders. */
  readonly demoConfirmedAt: UtcIso | null;
  readonly answers: Readonly<Record<string, readonly string[]>>;
  /** Share of after-task questions answered correctly first time (0–1). */
  readonly score: number;
  readonly note: string | null;
  readonly completedAt: UtcIso;
}
