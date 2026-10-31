import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';

/**
 * The optional ongoing notification for a MetaTrader task (spec §11, §37.2): it shows which step the learner is
 * on while they are in MetaTrader, and tapping it brings them back to that task. Wording is about learning
 * steps only: never trades, prices or signals.
 */
export interface TaskStepNotice {
  readonly taskId: string;
  readonly title: string;
  readonly body: string;
}

export type TaskNoticeOutcome = 'shown' | 'permission_denied';

export interface TaskNotificationGateway {
  /**
   * Shows the notice, replacing any earlier one. `prompt` allows the system permission prompt; it is true only
   * when the learner has just turned the notification on.
   */
  show(notice: TaskStepNotice, options: { readonly prompt: boolean }): Promise<Result<TaskNoticeOutcome, AppError>>;
  /** Removes the notice if it is showing. */
  clear(): Promise<Result<void, AppError>>;
  /** Whether notifications are allowed now. Never shows the permission prompt. */
  hasPermission(): Promise<boolean>;
  /**
   * Calls `listener` with the task id when the learner taps the notice, including the tap that opened the app.
   * Each tap is reported once, even if both the launch response and the live listener see it.
   */
  onOpen(listener: (taskId: string) => void): () => void;
}
