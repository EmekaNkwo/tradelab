import { z } from 'zod';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

export type AwardUnlockKind = 'challenge' | 'badge' | 'milestone';

export interface AwardUnlock {
  readonly kind: AwardUnlockKind;
  readonly awardId: string;
  readonly unlockedAt: UtcIso;
}

/** Latched awards (spec §29): the first time each challenge, badge or milestone was met. */
export interface AwardRepository {
  unlocks(): Promise<Result<readonly AwardUnlock[], AppError>>;
  /** Stores first unlocks; ones already stored keep their original date. */
  recordUnlocks(unlocks: readonly { readonly kind: AwardUnlockKind; readonly awardId: string }[], now: UtcIso): Promise<Result<void, AppError>>;
}

const unlockSchema = z.object({ kind: z.enum(['challenge', 'badge', 'milestone']), awardId: z.string().min(1).max(100) }).strict();

export function createAwardRepository(db: SqlDatabase, bus: ChangeBus): AwardRepository {
  return {
    async unlocks() {
      try {
        const rows = await db.getAllAsync<{ kind: AwardUnlockKind; award_id: string; unlocked_at: string }>('SELECT * FROM award_unlock ORDER BY unlocked_at', []);
        return ok(rows.map((r) => ({ kind: r.kind, awardId: r.award_id, unlockedAt: r.unlocked_at as UtcIso })));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading awards failed', cause));
      }
    },

    async recordUnlocks(unlocks, now) {
      if (unlocks.length === 0) return ok(undefined);
      const parsed = z.array(unlockSchema).safeParse(unlocks);
      if (!parsed.success) return err(validationError('Invalid award unlock'));
      try {
        await db.transactionAsync(async (tx) => {
          for (const u of parsed.data) {
            await tx.runAsync('INSERT OR IGNORE INTO award_unlock (kind, award_id, unlocked_at) VALUES (?, ?, ?)', [u.kind, u.awardId, now]);
          }
        });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving awards failed', cause));
      }
      bus.emit(['award_unlock']);
      return ok(undefined);
    },
  };
}
