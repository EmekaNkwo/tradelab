import { z } from 'zod';
import type { Timeframe } from '../../domain/models/markets';
import type { DrillAttempt, ReplayAttempt, StoredReplayTrade } from '../../domain/models/practice';
import { isDecimalString } from '../../shared/decimal';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

export const MAX_REPLAY_NOTE_LENGTH = 4000;

export type DrillAttemptInput = Omit<DrillAttempt, 'id' | 'answeredAt'>;
export type ReplayAttemptInput = Omit<ReplayAttempt, 'id' | 'finishedAt'>;

/** Chart drill answers and finished replays (spec §13.2, §13.4). Records are only ever added. */
export interface PracticeRepository {
  recordDrill(input: DrillAttemptInput, now: UtcIso): Promise<Result<DrillAttempt, AppError>>;
  /** Newest first. */
  drillAttempts(): Promise<Result<readonly DrillAttempt[], AppError>>;
  /** Counts per drill kind and chosen option, computed in SQL. */
  drillTallies(): Promise<Result<readonly DrillTally[], AppError>>;
  recordReplay(input: ReplayAttemptInput, now: UtcIso): Promise<Result<ReplayAttempt, AppError>>;
  /** Newest first, at most `limit`. A row that cannot be read is skipped (and logged), not fatal. */
  replayAttempts(limit?: number): Promise<Result<readonly ReplayAttempt[], AppError>>;
}

export interface DrillTally {
  readonly kind: string;
  readonly optionId: string;
  readonly answered: number;
  readonly correct: number;
}

export const DEFAULT_REPLAY_LIMIT = 50;

const decimalText = z.string().refine(isDecimalString, 'must be a decimal');
export const STORED_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as const satisfies readonly Timeframe[];
const TIMEFRAMES = STORED_TIMEFRAMES;

export const storedTradesSchema = z.array(
  z
    .object({
      side: z.enum(['buy', 'sell']),
      units: decimalText,
      entry: decimalText,
      exit: decimalText,
      initialStop: decimalText.nullable(),
      openedAt: z.number().int().min(0),
      closedAt: z.number().int().min(0),
      reason: z.enum(['stop_loss', 'take_profit', 'manual', 'end_of_data']),
      profit: decimalText,
    })
    .strict(),
) satisfies z.ZodType<StoredReplayTrade[]>;

const drillSchema = z
  .object({ kind: z.string().min(1), seed: z.number().int(), optionId: z.string().min(1), correct: z.boolean() })
  .strict();

const replaySchema = z
  .object({
    scenarioKind: z.string().min(1),
    seed: z.number().int(),
    timeframe: z.enum(TIMEFRAMES),
    startingBalance: decimalText,
    finalBalance: decimalText,
    trades: storedTradesSchema,
    processScore: z.number().min(0).max(1).nullable(),
    stepBacks: z.number().int().min(0),
    note: z.string().trim().max(MAX_REPLAY_NOTE_LENGTH).nullable(),
    startedAt: z.string().min(1),
  })
  .strict();

interface DrillRow {
  readonly id: string;
  readonly kind: string;
  readonly seed: number;
  readonly option_id: string;
  readonly correct: number;
  readonly answered_at: string;
}

interface ReplayRow {
  readonly id: string;
  readonly scenario_kind: string;
  readonly seed: number;
  readonly timeframe: Timeframe;
  readonly starting_balance: string;
  readonly final_balance: string;
  readonly trades: string;
  readonly process_score: number | null;
  readonly step_backs: number;
  readonly note: string | null;
  readonly started_at: string;
  readonly finished_at: string;
}

const drillFromRow = (r: DrillRow): DrillAttempt => ({
  id: r.id,
  kind: r.kind,
  seed: r.seed,
  optionId: r.option_id,
  correct: r.correct === 1,
  answeredAt: r.answered_at as UtcIso,
});

function replayFromRow(r: ReplayRow): ReplayAttempt | null {
  let trades: unknown;
  try {
    trades = JSON.parse(r.trades);
  } catch {
    return null;
  }
  const parsed = storedTradesSchema.safeParse(trades);
  return parsed.success ? toReplay(r, parsed.data) : null;
}

const toReplay = (r: ReplayRow, trades: readonly StoredReplayTrade[]): ReplayAttempt => ({
  id: r.id,
  scenarioKind: r.scenario_kind,
  seed: r.seed,
  timeframe: r.timeframe,
  startingBalance: r.starting_balance,
  finalBalance: r.final_balance,
  trades,
  processScore: r.process_score,
  stepBacks: r.step_backs,
  note: r.note,
  startedAt: r.started_at as UtcIso,
  finishedAt: r.finished_at as UtcIso,
});

const issuesOf = (e: z.ZodError) => ({ issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });

export function createPracticeRepository(db: SqlDatabase, bus: ChangeBus, newId: (prefix: string) => string): PracticeRepository {
  return {
    async recordDrill(input, now) {
      const parsed = drillSchema.safeParse(input);
      if (!parsed.success) return err(validationError('Invalid drill answer', issuesOf(parsed.error)));
      const attempt: DrillAttempt = { ...parsed.data, id: newId('drl'), answeredAt: now };
      try {
        await db.runAsync('INSERT INTO drill_attempt (id, kind, seed, option_id, correct, answered_at) VALUES (?, ?, ?, ?, ?, ?)', [
          attempt.id,
          attempt.kind,
          attempt.seed,
          attempt.optionId,
          attempt.correct ? 1 : 0,
          now,
        ]);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the drill failed', cause));
      }
      bus.emit(['drill_attempt']);
      return ok(attempt);
    },

    async drillAttempts() {
      try {
        const rows = await db.getAllAsync<DrillRow>('SELECT * FROM drill_attempt ORDER BY answered_at DESC, id DESC', []);
        return ok(rows.map(drillFromRow));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading drills failed', cause));
      }
    },

    async recordReplay(input, now) {
      const parsed = replaySchema.safeParse(input);
      if (!parsed.success) return err(validationError('Invalid replay', issuesOf(parsed.error)));
      const p = parsed.data;
      const note = p.note === null || p.note === '' ? null : p.note;
      const attempt: ReplayAttempt = { ...p, note, startedAt: p.startedAt as UtcIso, id: newId('rpl'), finishedAt: now };
      try {
        await db.runAsync(
          'INSERT INTO replay_attempt (id, scenario_kind, seed, timeframe, starting_balance, final_balance, trades, process_score, step_backs, note, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            attempt.id,
            attempt.scenarioKind,
            attempt.seed,
            attempt.timeframe,
            attempt.startingBalance,
            attempt.finalBalance,
            JSON.stringify(attempt.trades),
            attempt.processScore,
            attempt.stepBacks,
            note,
            attempt.startedAt,
            now,
          ],
        );
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the replay failed', cause));
      }
      bus.emit(['replay_attempt']);
      return ok(attempt);
    },

    async drillTallies() {
      try {
        const rows = await db.getAllAsync<{ kind: string; option_id: string; answered: number; correct: number }>(
          'SELECT kind, option_id, COUNT(*) AS answered, SUM(correct) AS correct FROM drill_attempt GROUP BY kind, option_id',
          [],
        );
        return ok(rows.map((r) => ({ kind: r.kind, optionId: r.option_id, answered: r.answered, correct: r.correct })));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading drills failed', cause));
      }
    },

    async replayAttempts(limit = DEFAULT_REPLAY_LIMIT) {
      try {
        const rows = await db.getAllAsync<ReplayRow>('SELECT * FROM replay_attempt ORDER BY finished_at DESC, id DESC LIMIT ?', [Math.max(1, Math.floor(limit))]);
        const attempts = rows.map(replayFromRow);
        const skipped = attempts.filter((a) => a === null).length;
        if (skipped > 0) logger.warn('Unreadable replay records skipped', { count: skipped });
        return ok(attempts.filter((a): a is ReplayAttempt => a !== null));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading replays failed', cause));
      }
    },
  };
}
