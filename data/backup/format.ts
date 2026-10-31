import { z } from 'zod';

/**
 * Backup file format. `formatVersion` versions the envelope; `schemaVersion`
 * is the database migration version the rows were exported from.
 * API keys live in secure storage and are never part of a backup (spec §34).
 */
export const BACKUP_FORMAT = 'tradelab-backup';
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Learner-owned tables included in backups, in insert order (parents first),
 * with the schema version that introduced each one. Every phase that adds
 * learner data must append its tables here.
 */
export const BACKUP_TABLE_SPECS = [
  { name: 'settings', sinceSchema: 1 },
  { name: 'user_profile', sinceSchema: 1 },
  { name: 'program_enrolment', sinceSchema: 2 },
  { name: 'daily_class', sinceSchema: 2 },
  { name: 'class_note', sinceSchema: 2 },
  { name: 'unit_completion', sinceSchema: 2 },
  { name: 'lesson_progress', sinceSchema: 2 },
  { name: 'quiz_attempt', sinceSchema: 2 },
  { name: 'review_queue', sinceSchema: 2 },
  { name: 'mission', sinceSchema: 2 },
  { name: 'mt_task_completion', sinceSchema: 3 },
  { name: 'drill_attempt', sinceSchema: 5 },
  { name: 'replay_attempt', sinceSchema: 5 },
  { name: 'paper_account', sinceSchema: 7 },
  { name: 'journal_entry', sinceSchema: 7 },
  { name: 'psych_attempt', sinceSchema: 7 },
  { name: 'trading_plan', sinceSchema: 8 },
  { name: 'lab_attempt', sinceSchema: 9 },
  { name: 'strategy_saved', sinceSchema: 10 },
  { name: 'strategy_version', sinceSchema: 11 },
  { name: 'backtest_run', sinceSchema: 11 },
  { name: 'playbook_entry', sinceSchema: 11 },
  { name: 'award_unlock', sinceSchema: 12 },
  // Provider data (provider_dataset) is a cache under the provider's terms, so it is not backed up.
  { name: 'imported_dataset', sinceSchema: 13 },
] as const;
export const BACKUP_TABLES: readonly string[] = BACKUP_TABLE_SPECS.map((t) => t.name);

/**
 * Columns written as null in a backup. Journal screenshots are files on this
 * phone, not in the backup, so a path to them would be broken on restore.
 */
export const BACKUP_NULLED_COLUMNS: Readonly<Record<string, readonly string[]>> = { journal_entry: ['screenshot_uri'] };

/** Tables a backup made at `schemaVersion` must contain (an absent table would wipe that data on restore). */
export function requiredTables(
  schemaVersion: number,
  specs: readonly { readonly name: string; readonly sinceSchema: number }[] = BACKUP_TABLE_SPECS,
): readonly string[] {
  return specs.filter((t) => t.sinceSchema <= schemaVersion).map((t) => t.name);
}

const cell = z.union([z.string(), z.number(), z.null()]);
export type BackupRow = Readonly<Record<string, string | number | null>>;

export const backupFileSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    formatVersion: z.number().int().positive(),
    appVersion: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    createdAt: z.string().min(1),
    tables: z.record(z.string(), z.array(z.record(z.string(), cell))),
  })
  .strict();

export type BackupFile = z.infer<typeof backupFileSchema>;

export interface BackupSummary {
  readonly createdAt: string;
  readonly appVersion: string;
  readonly schemaVersion: number;
  readonly rowCounts: Readonly<Record<string, number>>;
}

export function summarizeBackup(file: BackupFile): BackupSummary {
  return {
    createdAt: file.createdAt,
    appVersion: file.appVersion,
    schemaVersion: file.schemaVersion,
    rowCounts: Object.fromEntries(Object.entries(file.tables).map(([name, rows]) => [name, rows.length])),
  };
}
