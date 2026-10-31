import type { LocalDate } from '../../domain/learning/dates';
import type { MissionList } from '../../domain/learning/missions';
import { fromUnknown, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

/** Daily missions, one list per local date (spec §7.3). */
export interface MissionRepository {
  forDate(date: LocalDate): Promise<Result<MissionList | null, AppError>>;
  /** Saves the list for a date only if none exists yet, so progress is never reset. */
  saveIfAbsent(date: LocalDate, list: MissionList): Promise<Result<void, AppError>>;
  addProgress(date: LocalDate, kind: string, amount: number): Promise<Result<void, AppError>>;
}

interface Row {
  readonly kind: string;
  readonly title: string;
  readonly minutes: number;
  readonly target: number;
  readonly progress: number;
  readonly focus: string;
}

export function createMissionRepository(db: SqlDatabase, bus: ChangeBus): MissionRepository {
  return {
    async forDate(date) {
      try {
        const rows = await db.getAllAsync<Row>('SELECT * FROM mission WHERE date = ? ORDER BY position', [date]);
        if (rows.length === 0) return ok(null);
        return ok({
          focus: rows[0]?.focus ?? '',
          totalMinutes: rows.reduce((t, r) => t + r.minutes, 0),
          missions: rows.map((r) => ({ kind: r.kind, title: r.title, minutes: r.minutes, target: r.target, progress: r.progress })),
        });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading missions failed', cause));
      }
    },

    async saveIfAbsent(date, list) {
      try {
        await db.transactionAsync(async (tx) => {
          const existing = await tx.getFirstAsync('SELECT 1 FROM mission WHERE date = ? LIMIT 1', [date]);
          if (existing) return;
          for (const [position, m] of list.missions.entries()) {
            await tx.runAsync(
              'INSERT INTO mission (date, kind, title, minutes, target, progress, focus, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [date, m.kind, m.title, m.minutes, m.target, m.progress, list.focus, position],
            );
          }
        });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving missions failed', cause));
      }
      bus.emit(['mission']);
      return ok(undefined);
    },

    async addProgress(date, kind, amount) {
      try {
        const result = await db.runAsync('UPDATE mission SET progress = MIN(target, progress + ?) WHERE date = ? AND kind = ?', [
          Math.max(0, Math.floor(amount)),
          date,
          kind,
        ]);
        if (result.changes > 0) bus.emit(['mission']);
        return ok(undefined);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving mission progress failed', cause));
      }
    },
  };
}
