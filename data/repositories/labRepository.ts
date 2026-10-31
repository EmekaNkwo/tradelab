import { z } from 'zod';
import type { LabAttempt } from '../../domain/models/labs';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

/** Results of the lab exercises: red-flag cases, market scenarios, and strategy-page exercises and knowledge checks. */
export interface LabRepository {
  record(input: Omit<LabAttempt, 'id' | 'answeredAt'>, now: UtcIso): Promise<Result<LabAttempt, AppError>>;
  /** Newest first. Unreadable rows are skipped (and logged). */
  attempts(): Promise<Result<readonly LabAttempt[], AppError>>;
}

/**
 * Upper bound on stored picks. A knowledge check stores one "question=option"
 * pick per chosen option, so it grows with the number of questions; this
 * leaves ample room while still rejecting runaway input.
 */
export const MAX_LAB_PICKS = 500;

const inputSchema = z
  .object({
    kind: z.enum(['red_flag', 'scenario', 'strategy_exercise', 'strategy_check']),
    refId: z.string().min(1),
    picked: z.array(z.string().min(1)).max(MAX_LAB_PICKS),
    score: z.number().min(0).max(1),
  })
  .strict();

interface Row {
  readonly id: string;
  readonly kind: LabAttempt['kind'];
  readonly ref_id: string;
  readonly picked: string;
  readonly score: number;
  readonly answered_at: string;
}

const pickedSchema = z.array(z.string());

const fromRow = (r: Row): LabAttempt | null => {
  try {
    const picked = pickedSchema.safeParse(JSON.parse(r.picked));
    return picked.success ? { id: r.id, kind: r.kind, refId: r.ref_id, picked: picked.data, score: r.score, answeredAt: r.answered_at } : null;
  } catch {
    return null;
  }
};

export function createLabRepository(db: SqlDatabase, bus: ChangeBus, newId: (prefix: string) => string): LabRepository {
  return {
    async record(input, now) {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return err(validationError('Invalid lab answer', { issues: parsed.error.issues.map((i) => i.path.join('.')) }));
      const attempt: LabAttempt = { ...parsed.data, id: newId('lab'), answeredAt: now };
      try {
        await db.runAsync('INSERT INTO lab_attempt (id, kind, ref_id, picked, score, answered_at) VALUES (?, ?, ?, ?, ?, ?)', [
          attempt.id,
          attempt.kind,
          attempt.refId,
          JSON.stringify(attempt.picked),
          attempt.score,
          now,
        ]);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving your answer failed', cause));
      }
      bus.emit(['lab_attempt']);
      return ok(attempt);
    },

    async attempts() {
      try {
        const rows = await db.getAllAsync<Row>('SELECT * FROM lab_attempt ORDER BY answered_at DESC, id DESC', []);
        const parsed = rows.map(fromRow);
        const skipped = parsed.filter((a) => a === null).length;
        if (skipped > 0) logger.warn('Unreadable lab answers skipped', { count: skipped });
        return ok(parsed.filter((a): a is LabAttempt => a !== null));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading your lab answers failed', cause));
      }
    },
  };
}
