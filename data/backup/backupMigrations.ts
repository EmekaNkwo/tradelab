import { dataQualityError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { BackupFile, BackupRow } from './format';

/**
 * Upgrades backups exported from an older database schema so they can be
 * restored into the current one. When a migration changes a learner table
 * (renames a column, splits a table...), add a step here that transforms the
 * exported rows from `fromSchema` to `fromSchema + 1`. Purely additive
 * migrations (new tables, nullable/defaulted columns) need no step.
 */
export interface BackupMigrationStep {
  readonly fromSchema: number;
  readonly migrate: (tables: Readonly<Record<string, readonly BackupRow[]>>) => Record<string, BackupRow[]>;
}

export const BACKUP_MIGRATION_STEPS: readonly BackupMigrationStep[] = [];

export function upgradeBackup(
  file: BackupFile,
  targetSchema: number,
  steps: readonly BackupMigrationStep[] = BACKUP_MIGRATION_STEPS,
): Result<BackupFile, AppError> {
  if (file.schemaVersion > targetSchema) {
    return err(
      dataQualityError(
        `Backup was made by a newer app version (schema ${file.schemaVersion}, this app supports ${targetSchema}). Update the app first.`,
      ),
    );
  }
  let tables: Record<string, BackupRow[]> = file.tables;
  for (let version = file.schemaVersion; version < targetSchema; version += 1) {
    const step = steps.find((s) => s.fromSchema === version);
    if (step) tables = step.migrate(tables);
  }
  return ok({ ...file, schemaVersion: targetSchema, tables });
}
