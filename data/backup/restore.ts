import { dataQualityError, fromUnknown, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { SqlDatabase, SqlExecutor } from '../db/client';
import type { ChangeBus } from '../db/changeBus';
import { currentSchemaVersion } from '../db/migrate';
import { upgradeBackup } from './backupMigrations';
import { checkRows } from './rowValidators';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  backupFileSchema,
  requiredTables,
  summarizeBackup,
  type BackupFile,
  type BackupRow,
  type BackupSummary,
} from './format';

/** Parses and validates untrusted backup text. Nothing is written. */
export function parseBackup(text: string): Result<BackupFile, AppError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err(dataQualityError('Backup file is not valid JSON'));
  }
  const parsed = backupFileSchema.safeParse(json);
  if (!parsed.success) {
    return err(
      dataQualityError('Backup file has an unexpected structure', {
        issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`),
      }),
    );
  }
  if (parsed.data.formatVersion > BACKUP_FORMAT_VERSION) {
    return err(dataQualityError('Backup was made by a newer app version. Update the app first.'));
  }
  const tableError = checkTables(parsed.data);
  return tableError ? err(tableError) : ok(parsed.data);
}

function checkUnknownTables(file: BackupFile): AppError | null {
  const unknown = Object.keys(file.tables).filter((t) => !BACKUP_TABLES.includes(t));
  return unknown.length > 0 ? dataQualityError(`Backup contains unknown tables: ${unknown.join(', ')}`) : null;
}

/**
 * Table names come from the file: only known learner tables, and none that
 * existed at the backup's own schema version may be missing (that would wipe
 * the learner's data). Tables added by later migrations may be absent.
 */
function checkTables(file: BackupFile): AppError | null {
  const unknownError = checkUnknownTables(file);
  if (unknownError) return unknownError;
  const present = Object.keys(file.tables);
  const missing = requiredTables(file.schemaVersion).filter((t) => !present.includes(t));
  if (missing.length > 0) return dataQualityError(`Backup is incomplete; missing tables: ${missing.join(', ')}`);
  return null;
}

async function tableColumns(db: SqlDatabase, table: string): Promise<ReadonlySet<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`, []);
  return new Set(rows.map((r) => r.name));
}

/** Column names come from the file, so they are checked against the real schema before use in SQL. */
async function checkColumns(db: SqlDatabase, file: BackupFile): Promise<AppError | null> {
  for (const [table, rows] of Object.entries(file.tables)) {
    const allowed = await tableColumns(db, table);
    const bad = new Set(rows.flatMap((row) => Object.keys(row).filter((c) => !allowed.has(c))));
    if (bad.size > 0) return dataQualityError(`Backup table ${table} has unknown columns: ${[...bad].join(', ')}`);
  }
  return null;
}

async function insertRow(db: SqlExecutor, table: string, row: BackupRow): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');
  await db.runAsync(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    columns.map((c) => row[c] ?? null),
  );
}

/**
 * Replaces all learner data with the backup's contents in one transaction.
 * On any failure nothing changes.
 */
/** The settings key that a restore always resets to its defaults. */
export const RESET_ON_RESTORE_SETTING = 'integrations';

export async function restoreBackup(
  db: SqlDatabase,
  bus: ChangeBus,
  file: BackupFile,
): Promise<Result<BackupSummary, AppError>> {
  // Re-checked here so no caller (or backup upgrade step) can bypass the table whitelist.
  const tableError = checkTables(file);
  if (tableError) return err(tableError);
  try {
    const upgraded = upgradeBackup(file, await currentSchemaVersion(db));
    if (!upgraded.ok) return upgraded;
    const upgradedTableError = checkUnknownTables(upgraded.value);
    if (upgradedTableError) return err(upgradedTableError);
    const columnError = await checkColumns(db, upgraded.value);
    if (columnError) return err(columnError);
    const rowError = checkRows(upgraded.value);
    if (rowError) return err(rowError);

    await db.transactionAsync(async (tx) => {
      for (const table of [...BACKUP_TABLES].reverse()) {
        await tx.runAsync(`DELETE FROM ${table}`, []);
      }
      for (const table of BACKUP_TABLES) {
        for (const row of upgraded.value.tables[table] ?? []) {
          await insertRow(tx, table, row);
        }
      }
      // Online services and AI consent are never taken from a file: after a restore they are off
      // (the defaults) until the learner turns them on again on this phone (spec §34).
      await tx.runAsync(`DELETE FROM settings WHERE key = ?`, [RESET_ON_RESTORE_SETTING]);
    });
    bus.emit([...BACKUP_TABLES]);
    return ok(summarizeBackup(upgraded.value));
  } catch (cause) {
    return err(fromUnknown('DataQualityError', 'Restoring backup failed', cause));
  }
}
