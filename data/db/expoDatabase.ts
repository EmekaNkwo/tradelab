import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createWriteLock } from './writeLock';
import { CONNECTION_PRAGMAS, DATABASE_NAME, type SqlDatabase, type SqlExecutor, type SqlParams } from './client';

type ExpoExecutor = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

function adaptExecutor(db: ExpoExecutor): SqlExecutor {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params) => db.runAsync(source, [...params]),
    getAllAsync: <T>(source: string, params: SqlParams) => db.getAllAsync<T>(source, [...params]),
    getFirstAsync: <T>(source: string, params: SqlParams) => db.getFirstAsync<T>(source, [...params]),
  };
}

/**
 * One connection, with every write and transaction serialised by a write lock
 * (ADR 0004 addendum 2). A write issued outside `tx` while a transaction is
 * open waits for it to finish, so it can never join or interleave with it.
 * Using the main connection keeps its pragmas (foreign_keys, busy_timeout),
 * which cannot be enabled inside a transaction on a separate connection.
 */
export function adaptExpoDatabase(db: SQLiteDatabase): SqlDatabase {
  const lock = createWriteLock();
  const direct = adaptExecutor(db);
  return {
    ...direct,
    // Writes and transactions share one lock so they never overlap (see writeLock.ts).
    execAsync: (source) => lock.run(() => direct.execAsync(source)),
    runAsync: (source, params) => lock.run(() => direct.runAsync(source, params)),
    transactionAsync: (task) =>
      lock.run(() =>
        db.withTransactionAsync(async () => {
          await task(direct);
        }),
      ),
  };
}

/** Opens the on-device database with connection pragmas applied. */
export async function openAppDatabase(): Promise<SqlDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await db.execAsync(CONNECTION_PRAGMAS);
  return adaptExpoDatabase(db);
}
