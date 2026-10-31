import { fromUnknown, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { SqlDatabase } from '../db/client';
import { currentSchemaVersion } from '../db/migrate';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BACKUP_NULLED_COLUMNS, BACKUP_TABLES, type BackupFile, type BackupRow } from './format';

const withoutLocalFiles = (table: string, rows: readonly BackupRow[]): BackupRow[] => {
  const nulled = BACKUP_NULLED_COLUMNS[table] ?? [];
  return nulled.length === 0 ? [...rows] : rows.map((r) => ({ ...r, ...Object.fromEntries(nulled.map((c) => [c, null])) }));
};

export async function createBackup(
  db: SqlDatabase,
  appVersion: string,
  now: UtcIso,
): Promise<Result<BackupFile, AppError>> {
  try {
    // One transaction so the schema version and all tables form a single consistent snapshot.
    let schemaVersion = 0;
    const entries: (readonly [string, BackupRow[]])[] = [];
    await db.transactionAsync(async (tx) => {
      schemaVersion = await currentSchemaVersion(tx);
      for (const table of BACKUP_TABLES) {
        entries.push([table, withoutLocalFiles(table, await tx.getAllAsync<BackupRow>(`SELECT * FROM ${table}`, []))]);
      }
    });
    return ok({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion,
      schemaVersion,
      createdAt: now,
      tables: Object.fromEntries(entries),
    });
  } catch (cause) {
    return err(fromUnknown('StorageError', 'Creating backup failed', cause));
  }
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file);
}

export function backupFileName(now: UtcIso): string {
  return `tradelab-backup-${now.slice(0, 19).replace(/[:T]/g, '-')}.json`;
}
