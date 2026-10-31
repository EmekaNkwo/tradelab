import { fromUnknown, storageError, type AppError } from '../../shared/errors';
import { fnv1a } from '../../shared/hash';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { SqlDatabase, SqlExecutor } from './client';
import type { Migration } from './migrations';

export interface MigrationReport {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly number[];
}

interface MigrationLogRow {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

const CREATE_LOG = `
CREATE TABLE IF NOT EXISTS migration_log (
  version INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`;

export function migrationChecksum(migration: Migration): string {
  return fnv1a(migration.sql.trim());
}

function checkOrdering(migrations: readonly Migration[]): AppError | null {
  for (let i = 0; i < migrations.length; i += 1) {
    if (migrations[i]?.version !== i + 1) {
      return storageError(`Migrations must be numbered 1..n without gaps; found ${migrations[i]?.version} at index ${i}`);
    }
  }
  return null;
}

function checkAppliedLog(applied: readonly MigrationLogRow[], migrations: readonly Migration[]): AppError | null {
  for (const row of applied) {
    const known = migrations[row.version - 1];
    if (!known) {
      return storageError(
        `Database schema version ${row.version} is newer than this app supports (${migrations.length}). Update the app.`,
      );
    }
    if (migrationChecksum(known) !== row.checksum) {
      return storageError(`Migration ${row.version} (${row.name}) was changed after being applied`);
    }
  }
  return null;
}

/**
 * Applies pending migrations in order, each in its own transaction, and
 * records them in `migration_log`. Refuses to run if an applied migration was
 * edited or the database is newer than the app.
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly Migration[],
  now: UtcIso,
): Promise<Result<MigrationReport, AppError>> {
  const orderingError = checkOrdering(migrations);
  if (orderingError) return err(orderingError);

  try {
    await db.execAsync(CREATE_LOG);
    const applied = await db.getAllAsync<MigrationLogRow>(
      'SELECT version, name, checksum FROM migration_log ORDER BY version',
      [],
    );
    const logError = checkAppliedLog(applied, migrations);
    if (logError) return err(logError);

    const fromVersion = applied.length;
    const pending = migrations.slice(fromVersion);
    for (const migration of pending) {
      await db.transactionAsync(async (tx) => {
        await tx.execAsync(migration.sql);
        await tx.runAsync('INSERT INTO migration_log (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)', [
          migration.version,
          migration.name,
          migrationChecksum(migration),
          now,
        ]);
      });
    }
    return ok({ fromVersion, toVersion: migrations.length, applied: pending.map((m) => m.version) });
  } catch (cause) {
    return err(fromUnknown('StorageError', 'Database migration failed', cause));
  }
}

export async function currentSchemaVersion(db: SqlExecutor): Promise<number> {
  const row = await db.getFirstAsync<{ version: number | null }>('SELECT MAX(version) AS version FROM migration_log', []);
  return row?.version ?? 0;
}
