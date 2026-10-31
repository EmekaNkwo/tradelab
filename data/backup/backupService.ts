import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';
import { backupFileName, createBackup, serializeBackup } from './export';
import { summarizeBackup, type BackupFile, type BackupSummary } from './format';
import { parseBackup, restoreBackup } from './restore';

export interface PreparedBackup {
  readonly fileName: string;
  readonly text: string;
  readonly summary: BackupSummary;
}

export interface BackupService {
  prepare(now: UtcIso): Promise<Result<PreparedBackup, AppError>>;
  parse(text: string): Result<{ file: BackupFile; summary: BackupSummary }, AppError>;
  restore(file: BackupFile): Promise<Result<BackupSummary, AppError>>;
}

export function createBackupService(db: SqlDatabase, bus: ChangeBus, appVersion: string): BackupService {
  return {
    async prepare(now) {
      const backup = await createBackup(db, appVersion, now);
      if (!backup.ok) return backup;
      return {
        ok: true,
        value: { fileName: backupFileName(now), text: serializeBackup(backup.value), summary: summarizeBackup(backup.value) },
      };
    },
    parse(text) {
      const parsed = parseBackup(text);
      return parsed.ok ? { ok: true, value: { file: parsed.value, summary: summarizeBackup(parsed.value) } } : parsed;
    },
    restore: (file) => restoreBackup(db, bus, file),
  };
}
