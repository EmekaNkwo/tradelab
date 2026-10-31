import { fromUnknown, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { SqlDatabase } from '../db/client';

export interface InstalledContentVersion {
  readonly version: string;
  readonly contentHash: string;
  readonly installedAt: UtcIso;
}

export interface ContentVersionRepository {
  get(): Promise<Result<InstalledContentVersion | null, AppError>>;
  /** Records the bundled content version; returns true when it changed (content update). */
  record(version: string, contentHash: string, now: UtcIso): Promise<Result<boolean, AppError>>;
}

interface Row {
  readonly version: string;
  readonly content_hash: string;
  readonly installed_at: string;
}

export function createContentVersionRepository(db: SqlDatabase): ContentVersionRepository {
  const get = async (): Promise<Result<InstalledContentVersion | null, AppError>> => {
    try {
      const row = await db.getFirstAsync<Row>('SELECT version, content_hash, installed_at FROM content_version WHERE id = 1', []);
      return ok(row ? { version: row.version, contentHash: row.content_hash, installedAt: row.installed_at as UtcIso } : null);
    } catch (cause) {
      return err(fromUnknown('StorageError', 'Reading content version failed', cause));
    }
  };

  const record = async (version: string, contentHash: string, now: UtcIso): Promise<Result<boolean, AppError>> => {
    const current = await get();
    if (!current.ok) return current;
    if (current.value?.contentHash === contentHash) return ok(false);
    try {
      await db.runAsync(
        `INSERT INTO content_version (id, version, content_hash, installed_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET version = excluded.version, content_hash = excluded.content_hash, installed_at = excluded.installed_at`,
        [version, contentHash, now],
      );
      return ok(true);
    } catch (cause) {
      return err(fromUnknown('StorageError', 'Recording content version failed', cause));
    }
  };

  return { get, record };
}
