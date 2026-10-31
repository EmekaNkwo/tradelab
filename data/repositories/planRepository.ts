import { z } from 'zod';
import type { Timeframe } from '../../domain/models/markets';
import { planIssues, type PlanVersion, type TradingPlan } from '../../domain/plan/plan';
import type { SessionId } from '../../domain/plan/sessions';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

/** The learner's trading plan, saved as numbered versions (spec §20). */
export interface PlanRepository {
  /** The newest version, or null before the first save. */
  latest(): Promise<Result<PlanVersion | null, AppError>>;
  /** Newest first. Unreadable versions are skipped (and logged). */
  versions(): Promise<Result<readonly PlanVersion[], AppError>>;
  /** Saves a new version; the plan must have no `planIssues`. An unchanged plan returns the latest version without saving. */
  save(plan: TradingPlan, now: UtcIso): Promise<Result<PlanVersion, AppError>>;
}

const SESSION_IDS = ['sydney', 'tokyo', 'london', 'new_york'] as const satisfies readonly SessionId[];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as const satisfies readonly Timeframe[];

export const planSchema = z
  .object({
    instruments: z.array(z.string()),
    sessions: z.array(z.enum(SESSION_IDS)),
    timeframes: z.array(z.enum(TIMEFRAMES)),
    entryRules: z.string(),
    exitRules: z.string(),
    stopRules: z.string(),
    targetRules: z.string(),
    riskPerTradePercent: z.number(),
    dailyLossPercent: z.number(),
    maxTradesPerDay: z.number(),
    stopTradingWhen: z.string(),
    notes: z.string(),
  })
  .strict()
  .refine((p) => planIssues(p).length === 0, 'incomplete trading plan') satisfies z.ZodType<TradingPlan>;

interface Row {
  readonly version: number;
  readonly plan: string;
  readonly created_at: string;
}

/** A stored plan, or null when it is not valid JSON or not a complete plan. */
export function parsePlan(json: string): TradingPlan | null {
  try {
    const parsed = planSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const fromRow = (r: Row): PlanVersion | null => {
  const plan = parsePlan(r.plan);
  return plan ? { version: r.version, plan, createdAt: r.created_at } : null;
};

/** Trims the free text so stored plans are tidy. */
const tidy = (p: TradingPlan): TradingPlan => ({
  ...p,
  instruments: p.instruments.map((i) => i.trim().toUpperCase()),
  entryRules: p.entryRules.trim(),
  exitRules: p.exitRules.trim(),
  stopRules: p.stopRules.trim(),
  targetRules: p.targetRules.trim(),
  stopTradingWhen: p.stopTradingWhen.trim(),
  notes: p.notes.trim(),
});

export function createPlanRepository(db: SqlDatabase, bus: ChangeBus): PlanRepository {
  const versions = async (): Promise<Result<readonly PlanVersion[], AppError>> => {
    try {
      const rows = await db.getAllAsync<Row>('SELECT version, plan, created_at FROM trading_plan ORDER BY version DESC', []);
      const parsed = rows.map(fromRow);
      const skipped = parsed.filter((v) => v === null).length;
      if (skipped > 0) logger.warn('Unreadable trading plan versions skipped', { count: skipped });
      return ok(parsed.filter((v): v is PlanVersion => v !== null));
    } catch (cause) {
      return err(fromUnknown('StorageError', 'Reading your trading plan failed', cause));
    }
  };

  return {
    versions,
    async latest() {
      const all = await versions();
      return all.ok ? ok(all.value[0] ?? null) : all;
    },
    async save(plan, now) {
      const clean = tidy(plan);
      const parsed = planSchema.safeParse(clean);
      if (!parsed.success) {
        const issues = planIssues(clean);
        return err(validationError(issues[0]?.message ?? 'The plan is not complete', { issues: issues.map((i) => i.field) }));
      }
      try {
        const json = JSON.stringify(parsed.data);
        const outcome: { result?: PlanVersion; inserted?: boolean } = {};
        await db.transactionAsync(async (tx) => {
          const top = await tx.getAllAsync<Row>('SELECT version, plan, created_at FROM trading_plan ORDER BY version DESC LIMIT 1', []);
          const latest = top[0];
          const same = latest && latest.plan === json ? fromRow(latest) : null;
          if (same) {
            outcome.result = same;
            return;
          }
          const version = (latest?.version ?? 0) + 1;
          await tx.runAsync('INSERT INTO trading_plan (version, plan, created_at) VALUES (?, ?, ?)', [version, json, now]);
          outcome.result = { version, plan: parsed.data, createdAt: now };
          outcome.inserted = true;
        });
        if (!outcome.result) return err(fromUnknown('StorageError', 'Saving your trading plan failed', 'no result'));
        if (outcome.inserted) bus.emit(['trading_plan']);
        return ok(outcome.result);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving your trading plan failed', cause));
      }
    },
  };
}
