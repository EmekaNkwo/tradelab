/**
 * Test-only adapter: runs the real SQL against Node's built-in SQLite so
 * migrations, repositories, and backups are tested without a device.
 * Never imported by app code.
 */
import { DatabaseSync } from 'node:sqlite';
import type { SqlDatabase, SqlExecutor, SqlParams, SqlRunResult } from '../data/db/client';

export interface TestDatabase extends SqlDatabase {
  close(): void;
}

/**
 * Every database a test file opens. The custom Jest environments
 * (`testing/env/`) close any still open in their `teardown()`, which runs after
 * all of the file's own hooks. The Set lives on the test file's global, under
 * the key the environment reads (`REGISTRY_KEY` in `testing/env/withTestDbTeardown.js`).
 */
const REGISTRY_KEY = '__tradelabOpenTestDatabases';
type Registry = Set<DatabaseSync>;

function registry(): Registry {
  const scope = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  scope[REGISTRY_KEY] ??= new Set<DatabaseSync>();
  return scope[REGISTRY_KEY];
}

/** Closes every test database still open and returns how many it closed. Safe to call more than once. */
export function closeOpenTestDatabases(): number {
  const open = registry();
  const count = open.size;
  for (const raw of open) {
    if (raw.isOpen) raw.close();
  }
  open.clear();
  return count;
}

export function openTestDatabase(): TestDatabase {
  const raw = new DatabaseSync(':memory:');
  registry().add(raw);
  raw.exec('PRAGMA foreign_keys = ON;');
  let depth = 0;

  const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

  const executor: SqlExecutor = {
    async execAsync(source: string): Promise<void> {
      raw.exec(source);
    },
    async runAsync(source: string, params: SqlParams): Promise<SqlRunResult> {
      const result = raw.prepare(source).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async getAllAsync<T>(source: string, params: SqlParams): Promise<T[]> {
      return raw.prepare(source).all(...params).map((row) => plain<T>(row));
    },
    async getFirstAsync<T>(source: string, params: SqlParams): Promise<T | null> {
      const row = raw.prepare(source).get(...params);
      return row === undefined ? null : plain<T>(row);
    },
  };

  return {
    ...executor,
    /** Node's SQLite is synchronous, so a savepoint around the task is atomic for tests. */
    async transactionAsync(task: (tx: SqlExecutor) => Promise<void>): Promise<void> {
      const savepoint = `sp_${depth}`;
      depth += 1;
      raw.exec(`SAVEPOINT ${savepoint}`);
      try {
        await task(executor);
        raw.exec(`RELEASE ${savepoint}`);
      } catch (error) {
        raw.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        throw error;
      } finally {
        depth -= 1;
      }
    },
    /** Idempotent: closing twice (here and in the shared teardown) is fine. */
    close(): void {
      registry().delete(raw);
      if (raw.isOpen) raw.close();
    },
  };
}
