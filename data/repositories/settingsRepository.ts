import { EXAMPLE_RISK_RULES, invalidRuleFields } from '../../domain/risk/rules';
import { z } from 'zod';
import type { AppSettings } from '../../domain/models/learner';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { DEFAULT_TIME_ZONE, isUtcIso, isValidTimeZone, type UtcIso } from '../../shared/time';
import type { SqlDatabase } from '../db/client';
import type { ChangeBus } from '../db/changeBus';

export interface SettingsRepository {
  get(): Promise<Result<AppSettings, AppError>>;
  update(patch: Partial<AppSettings>, now: UtcIso): Promise<Result<AppSettings, AppError>>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  explanationLevel: 'simple',
  timeZone: DEFAULT_TIME_ZONE,
  lastBackupAt: null,
  riskRules: EXAMPLE_RISK_RULES,
  preTradeChecklist: true,
  streaks: true,
  // New reminder types are opt-in (spec §29); only the class reminder is chosen during onboarding.
  reminders: { weakReview: false, weeklySummary: false, backup: false },
  // Online services and the coach are opt-in (spec §24.2, §34); nothing is shared until the learner agrees.
  integrations: { marketProvider: false, coach: 'off', cloudModel: 'claude-haiku-5-5', coachConsent: { journal: false, strategies: false, backtests: false } },
  mtStepNotification: false,
};

const utcIso = z.string().refine(isUtcIso, 'must be a UTC ISO timestamp') as unknown as z.ZodType<UtcIso>;

const fieldSchemas = {
  theme: z.enum(['system', 'light', 'dark']),
  explanationLevel: z.enum(['simple', 'balanced', 'advanced']),
  timeZone: z.string().refine(isValidTimeZone, 'must be a valid IANA time zone'),
  lastBackupAt: utcIso.nullable(),
  riskRules: z
    .object({
      maxRiskPerTradePercent: z.number(),
      maxDailyLossPercent: z.number(),
      maxOpenPositions: z.number(),
      maxMarginUsePercent: z.number(),
      reviewAfterLosses: z.number(),
      requireStop: z.boolean(),
    })
    .strict()
    .refine((r) => invalidRuleFields(r).length === 0, 'risk rules out of range'),
  preTradeChecklist: z.boolean(),
  streaks: z.boolean(),
  reminders: z.object({ weakReview: z.boolean(), weeklySummary: z.boolean(), backup: z.boolean() }).strict(),
  integrations: z
    .object({
      marketProvider: z.boolean(),
      coach: z.enum(['off', 'curated', 'cloud']),
      cloudModel: z.enum(['claude-opus-5-5', 'claude-haiku-5-5']),
      coachConsent: z.object({ journal: z.boolean(), strategies: z.boolean(), backtests: z.boolean() }).strict(),
    })
    .strict(),
  mtStepNotification: z.boolean(),
} satisfies { [K in keyof AppSettings]: z.ZodType<AppSettings[K]> };

const settingsSchema = z.object(fieldSchemas).strict();

type SettingKey = keyof AppSettings;
const SETTING_KEYS = Object.keys(fieldSchemas) as SettingKey[];

interface SettingRow {
  readonly key: string;
  readonly value: string;
}

/** Parses stored rows; a corrupt or unknown value falls back to its default. */
function rowsToSettings(rows: readonly SettingRow[]): AppSettings {
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const entries = SETTING_KEYS.map((key) => {
    const raw = stored.get(key);
    if (raw === undefined) return [key, DEFAULT_SETTINGS[key]] as const;
    try {
      const parsed = fieldSchemas[key].safeParse(JSON.parse(raw));
      return [key, parsed.success ? parsed.data : DEFAULT_SETTINGS[key]] as const;
    } catch {
      return [key, DEFAULT_SETTINGS[key]] as const;
    }
  });
  return Object.fromEntries(entries) as unknown as AppSettings;
}

export function createSettingsRepository(db: SqlDatabase, bus: ChangeBus): SettingsRepository {
  const get = async (): Promise<Result<AppSettings, AppError>> => {
    try {
      const rows = await db.getAllAsync<SettingRow>('SELECT key, value FROM settings', []);
      return ok(rowsToSettings(rows));
    } catch (cause) {
      return err(fromUnknown('StorageError', 'Reading settings failed', cause));
    }
  };

  const update = async (patch: Partial<AppSettings>, now: UtcIso): Promise<Result<AppSettings, AppError>> => {
    const current = await get();
    if (!current.ok) return current;
    const parsed = settingsSchema.safeParse({ ...current.value, ...patch });
    if (!parsed.success) {
      return err(validationError('Invalid settings', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }));
    }
    const changedKeys = (Object.keys(patch) as SettingKey[]).filter((k) => SETTING_KEYS.includes(k));
    try {
      await db.transactionAsync(async (tx) => {
        for (const key of changedKeys) {
          await tx.runAsync(
            'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
            [key, JSON.stringify(parsed.data[key]), now],
          );
        }
      });
    } catch (cause) {
      return err(fromUnknown('StorageError', 'Saving settings failed', cause));
    }
    bus.emit(['settings']);
    return ok(parsed.data as AppSettings);
  };

  return { get, update };
}
