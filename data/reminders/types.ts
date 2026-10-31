import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';

/** A weekly local reminder: weekday 0 = Sunday … 6 = Saturday, local time. */
export interface WeeklySlot {
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
}

/** Learning reminders only (spec §29): never prompts to trade or watch prices. */
export type ReminderKind = 'class' | 'weak_review' | 'weekly_summary' | 'backup';

export interface ReminderPlan {
  readonly kind: ReminderKind;
  readonly title: string;
  readonly body: string;
  readonly slots: readonly WeeklySlot[];
}

export type ReminderSyncOutcome = 'scheduled' | 'cleared' | 'permission_denied';

export interface ReminderSyncOptions {
  /**
   * Whether the system permission prompt may be shown. True only when the
   * learner just did something reminder-related (turned a reminder on, enrolled);
   * background resyncs (start-up, after a review) pass false and never prompt.
   */
  readonly prompt: boolean;
}

/**
 * Local learning reminders (spec §7.2, §29): class time, weak-concept review,
 * weekly summary and backup. Never prompts to trade or watch prices.
 * Implemented in integrations/.
 */
export interface ReminderGateway {
  /** Replaces all scheduled reminders with `plans` (an empty list clears them). */
  sync(plans: readonly ReminderPlan[], options: ReminderSyncOptions): Promise<Result<ReminderSyncOutcome, AppError>>;
}
