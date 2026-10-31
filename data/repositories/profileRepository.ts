import { z } from 'zod';
import type { UserProfile } from '../../domain/models/learner';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { isUtcIso, isValidTimeZone, type UtcIso } from '../../shared/time';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

export interface ProfileRepository {
  /** The learner's profile, or null before onboarding is finished. */
  get(): Promise<Result<UserProfile | null, AppError>>;
  save(profile: UserProfile): Promise<Result<UserProfile, AppError>>;
}

const utcIso = z.string().refine(isUtcIso) as unknown as z.ZodType<UtcIso>;
const market = z.enum(['forex', 'stocks', 'penny_stocks', 'commodities', 'futures']);

export const profileSchema = z
  .object({
    id: z.string().min(1),
    experience: z.enum(['complete_beginner', 'know_basic_terms', 'used_simulated_trading', 'have_traded', 'quant_research']),
    markets: z.array(market).min(1),
    goals: z
      .array(
        z.enum([
          'understand_markets',
          'technical_analysis',
          'fundamental_analysis',
          'famous_traders',
          'develop_strategies',
          'risk_management',
          'chart_practice',
          'quant_backtesting',
          'long_term_investing',
        ]),
      )
      .min(1),
    explanationLevel: z.enum(['simple', 'balanced', 'advanced']),
    metaTrader: z.object({ version: z.enum(['mt4', 'mt5']), installed: z.boolean() }).strict().nullable(),
    timeZone: z.string().refine(isValidTimeZone),
    riskAcknowledgedAt: utcIso.nullable(),
    createdAt: utcIso,
    updatedAt: utcIso,
  })
  .strict() satisfies z.ZodType<UserProfile>;

export interface ProfileRow {
  readonly id: string;
  readonly experience: string;
  readonly markets: string;
  readonly goals: string;
  readonly explanation_level: string;
  readonly metatrader: string | null;
  readonly time_zone: string;
  readonly risk_acknowledged_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export function parseProfileRow(row: ProfileRow): Result<UserProfile, AppError> {
  try {
    const parsed = profileSchema.safeParse({
      id: row.id,
      experience: row.experience,
      markets: JSON.parse(row.markets),
      goals: JSON.parse(row.goals),
      explanationLevel: row.explanation_level,
      metaTrader: row.metatrader === null ? null : JSON.parse(row.metatrader),
      timeZone: row.time_zone,
      riskAcknowledgedAt: row.risk_acknowledged_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    return parsed.success ? ok(parsed.data) : err(fromUnknown('DataQualityError', 'Stored profile is invalid', parsed.error));
  } catch (cause) {
    return err(fromUnknown('DataQualityError', 'Stored profile is unreadable', cause));
  }
}

export function createProfileRepository(db: SqlDatabase, bus: ChangeBus): ProfileRepository {
  return {
    async get() {
      try {
        const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM user_profile ORDER BY created_at LIMIT 1', []);
        return row ? parseProfileRow(row) : ok(null);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading profile failed', cause));
      }
    },

    async save(profile) {
      const parsed = profileSchema.safeParse(profile);
      if (!parsed.success) {
        return err(validationError('Invalid profile', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }));
      }
      const p = parsed.data;
      try {
        await db.runAsync(
          `INSERT INTO user_profile (id, experience, markets, goals, explanation_level, metatrader, time_zone, risk_acknowledged_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET experience = excluded.experience, markets = excluded.markets, goals = excluded.goals,
             explanation_level = excluded.explanation_level, metatrader = excluded.metatrader, time_zone = excluded.time_zone,
             risk_acknowledged_at = excluded.risk_acknowledged_at, updated_at = excluded.updated_at`,
          [
            p.id,
            p.experience,
            JSON.stringify(p.markets),
            JSON.stringify(p.goals),
            p.explanationLevel,
            p.metaTrader === null ? null : JSON.stringify(p.metaTrader),
            p.timeZone,
            p.riskAcknowledgedAt,
            p.createdAt,
            p.updatedAt,
          ],
        );
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving profile failed', cause));
      }
      bus.emit(['user_profile']);
      return ok(p);
    },
  };
}
