/**
 * Minimal database interface. It mirrors the subset of `expo-sqlite`'s
 * `SQLiteDatabase` we use, so the real database satisfies it directly and
 * tests can supply a Node `node:sqlite` adapter (see `testing/nodeSqlite.ts`).
 */
export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface SqlRunResult {
  readonly changes: number;
  readonly lastInsertRowId: number;
}

/** Statements that can run either directly or inside a transaction. */
export interface SqlExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlParams): Promise<SqlRunResult>;
  getAllAsync<T>(source: string, params: SqlParams): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlParams): Promise<T | null>;
}

export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `task` atomically. Only statements issued through `tx` belong to the
   * transaction; anything else issued meanwhile (e.g. a live-query reload)
   * cannot leak into it or see its uncommitted state. Commits on success,
   * rolls back if `task` throws.
   */
  transactionAsync(task: (tx: SqlExecutor) => Promise<void>): Promise<void>;
}

export const DATABASE_NAME = 'tradelab.db';

/** Pragmas applied every time the database is opened. */
export const CONNECTION_PRAGMAS = 'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;';
