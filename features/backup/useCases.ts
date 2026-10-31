import type { BackupFile, BackupSummary } from '../../data';
import type { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import type { Container } from '../app';
import { BACKGROUND, resyncReminders, USER_ACTION } from '../learning';

type Deps = Pick<Container, 'backup' | 'backupFiles' | 'settings' | 'clock' | 'learning' | 'reminders' | 'taskNotifications'>;

export interface ExportOutcome {
  readonly summary: BackupSummary;
  readonly shared: boolean;
}

/** Creates a backup file, offers it to the share sheet, and records when it happened. */
export async function exportBackup(deps: Deps): Promise<Result<ExportOutcome, AppError>> {
  const now = toUtcIso(deps.clock.now());
  const prepared = await deps.backup.prepare(now);
  if (!prepared.ok) return prepared;
  const saved = await deps.backupFiles.saveAndShare(prepared.value.fileName, prepared.value.text);
  if (!saved.ok) return saved;
  // The file is already saved; failing to record the time must not report the backup as failed.
  const recorded = await deps.settings.update({ lastBackupAt: now }, now);
  if (!recorded.ok) logger.warn('Backup saved but lastBackupAt was not recorded', { kind: recorded.error.kind });
  return ok({ summary: prepared.value.summary, shared: saved.value.shared });
}

export interface PickedBackup {
  readonly file: BackupFile;
  readonly summary: BackupSummary;
}

/** Lets the learner choose a file and validates it. Nothing is written yet. */
export async function pickBackup(deps: Pick<Container, 'backup' | 'backupFiles'>): Promise<Result<PickedBackup | null, AppError>> {
  const picked = await deps.backupFiles.pickText();
  if (!picked.ok || picked.value === null) return picked as Result<null, AppError>;
  return deps.backup.parse(picked.value);
}

/** True when the backup holds a learner profile, i.e. it comes from a phone that finished setting up. */
export function hasProfile(summary: BackupSummary): boolean {
  return (summary.rowCounts.user_profile ?? 0) > 0;
}

export interface RestoreOutcome {
  readonly summary: BackupSummary;
  /** The restored reminders are on but this phone has not allowed notifications yet; nothing prompted. */
  readonly remindersNeedPermission: boolean;
  /** The restored MetaTrader step notice was turned off, because this phone has not allowed notifications. */
  readonly stepNoticeTurnedOff: boolean;
}

/**
 * Restores a picked backup, then reschedules reminders from the restored data (it may hold another program or
 * settings). A restore never shows the permission prompt: it reports what needs permission instead.
 */
export async function restorePickedBackup(deps: Deps, picked: PickedBackup): Promise<Result<RestoreOutcome, AppError>> {
  const restored = await deps.backup.restore(picked.file);
  if (!restored.ok) return restored;
  const reminders = await resyncReminders(deps, BACKGROUND);
  const stepNoticeTurnedOff = await turnOffStepNoticeWithoutPermission(deps);
  return ok({ summary: restored.value, remindersNeedPermission: reminders === 'permission_denied', stepNoticeTurnedOff });
}

async function turnOffStepNoticeWithoutPermission(deps: Deps): Promise<boolean> {
  const settings = await deps.settings.get();
  if (!settings.ok || !settings.value.mtStepNotification) return false;
  if (await deps.taskNotifications.hasPermission()) return false;
  const off = await deps.settings.update({ mtStepNotification: false }, toUtcIso(deps.clock.now()));
  if (!off.ok) logger.warn('Step notification not turned off after restore', { kind: off.error.kind });
  return off.ok;
}

/** The learner asked to allow notifications for the restored reminders: this may show the system prompt. */
export async function allowReminderNotifications(deps: Deps): Promise<boolean> {
  return (await resyncReminders(deps, USER_ACTION)) !== 'permission_denied';
}
