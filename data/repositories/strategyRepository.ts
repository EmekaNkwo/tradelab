import { z } from 'zod';
import type { SavedListKind, SavedStrategy } from '../../domain/models/strategies';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

/** Bookmarks and the personal study list (spec §16.1). */
export interface StrategyRepository {
  /** Every saved strategy: bookmarks in the order added, the study list in its own order. */
  saved(): Promise<Result<readonly SavedStrategy[], AppError>>;
  /** Adds to the end of a list; adding something already there changes nothing. */
  add(strategyId: string, list: SavedListKind, now: UtcIso): Promise<Result<void, AppError>>;
  remove(strategyId: string, list: SavedListKind): Promise<Result<void, AppError>>;
  /**
   * Moves one study-list item up (-1) or down (+1) past its neighbour among
   * `visibleIds` (the items the learner can see); at either end it stays put.
   * Saved items whose page is not in the current content keep their place.
   */
  move(strategyId: string, direction: -1 | 1, visibleIds: readonly string[]): Promise<Result<void, AppError>>;
}

export const SAVED_LISTS = ['bookmark', 'study'] as const satisfies readonly SavedListKind[];

const inputSchema = z.object({ strategyId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), list: z.enum(SAVED_LISTS) }).strict();

interface Row {
  readonly strategy_id: string;
  readonly list: SavedListKind;
  readonly position: number;
  readonly added_at: string;
}

const TABLE = ['strategy_saved'];

export function createStrategyRepository(db: SqlDatabase, bus: ChangeBus): StrategyRepository {
  const write = async (run: () => Promise<void>, failure: string): Promise<Result<void, AppError>> => {
    try {
      await run();
    } catch (cause) {
      return err(fromUnknown('StorageError', failure, cause));
    }
    bus.emit(TABLE);
    return ok(undefined);
  };

  return {
    async saved() {
      try {
        const rows = await db.getAllAsync<Row>('SELECT * FROM strategy_saved ORDER BY list, position, added_at, strategy_id', []);
        return ok(rows.map((r) => ({ strategyId: r.strategy_id, list: r.list, addedAt: r.added_at })));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading your saved strategies failed', cause));
      }
    },

    async add(strategyId, list, now) {
      const parsed = inputSchema.safeParse({ strategyId, list });
      if (!parsed.success) return err(validationError('Invalid strategy or list', { issues: parsed.error.issues.map((i) => i.path.join('.')) }));
      return write(
        () =>
          db.runAsync(
            `INSERT OR IGNORE INTO strategy_saved (strategy_id, list, position, added_at)
             VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM strategy_saved WHERE list = ?), ?)`,
            [strategyId, list, list, now],
          ).then(() => undefined),
        'Saving the strategy failed',
      );
    },

    async remove(strategyId, list) {
      const parsed = inputSchema.safeParse({ strategyId, list });
      if (!parsed.success) return err(validationError('Invalid strategy or list'));
      return write(() => db.runAsync('DELETE FROM strategy_saved WHERE strategy_id = ? AND list = ?', [strategyId, list]).then(() => undefined), 'Removing the strategy failed');
    },

    async move(strategyId, direction, visibleIds) {
      const visible = new Set(visibleIds);
      return write(
        () =>
          db.transactionAsync(async (tx) => {
            const rows = await tx.getAllAsync<Row>("SELECT * FROM strategy_saved WHERE list = 'study' ORDER BY position, added_at, strategy_id", []);
            const shown = rows.filter((r) => visible.has(r.strategy_id));
            const from = shown.findIndex((r) => r.strategy_id === strategyId);
            const a = shown[from];
            const b = shown[from + direction];
            if (from < 0 || !a || !b) return;
            // Positions are unique, so swapping the two keeps every other item where it was.
            await tx.runAsync("UPDATE strategy_saved SET position = ? WHERE list = 'study' AND strategy_id = ?", [b.position, a.strategy_id]);
            await tx.runAsync("UPDATE strategy_saved SET position = ? WHERE list = 'study' AND strategy_id = ?", [a.position, b.strategy_id]);
          }),
        'Reordering your study list failed',
      );
    },
  };
}
