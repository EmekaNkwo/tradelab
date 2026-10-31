import type { Timeframe } from '../models/markets';
import { RISK_RULE_LIMITS } from '../risk/rules';
import type { SessionId } from './sessions';

/**
 * The learner's one-page trading plan (spec §20). Saved as numbered versions,
 * so earlier plans stay readable. The numbers are the learner's own; the app
 * only checks that they are in the same ranges as the risk rules.
 */
export interface TradingPlan {
  readonly instruments: readonly string[];
  readonly sessions: readonly SessionId[];
  readonly timeframes: readonly Timeframe[];
  readonly entryRules: string;
  readonly exitRules: string;
  readonly stopRules: string;
  readonly targetRules: string;
  readonly riskPerTradePercent: number;
  readonly dailyLossPercent: number;
  readonly maxTradesPerDay: number;
  /** When the learner stops for the day or steps back (e.g. after a set number of losses). */
  readonly stopTradingWhen: string;
  readonly notes: string;
}

export interface PlanVersion {
  readonly version: number;
  readonly plan: TradingPlan;
  readonly createdAt: string;
}

export const PLAN_LIMITS = {
  instruments: { min: 1, max: 10 },
  instrumentLength: 20,
  text: 1500,
  maxTradesPerDay: { min: 1, max: 50 },
} as const;

export const EMPTY_PLAN: TradingPlan = {
  instruments: [],
  sessions: [],
  timeframes: [],
  entryRules: '',
  exitRules: '',
  stopRules: '',
  targetRules: '',
  riskPerTradePercent: 1,
  dailyLossPercent: 3,
  maxTradesPerDay: 3,
  stopTradingWhen: '',
  notes: '',
};

export type PlanField = keyof TradingPlan;

export interface PlanIssue {
  readonly field: PlanField;
  readonly message: string;
}

const inRange = (v: number, r: { readonly min: number; readonly max: number }) => Number.isFinite(v) && v >= r.min && v <= r.max;

/** Everything that must be fixed before the plan can be saved; empty when it is complete. */
export function planIssues(p: TradingPlan): readonly PlanIssue[] {
  const out: PlanIssue[] = [];
  const need = (field: PlanField, ok: boolean, message: string) => {
    if (!ok) out.push({ field, message });
  };
  need('instruments', p.instruments.length >= PLAN_LIMITS.instruments.min, 'Add at least one instrument you will trade');
  need('instruments', p.instruments.length <= PLAN_LIMITS.instruments.max, `Keep the list to ${PLAN_LIMITS.instruments.max} instruments or fewer`);
  need(
    'instruments',
    p.instruments.every((i) => i.trim().length > 0 && i.length <= PLAN_LIMITS.instrumentLength),
    `Each instrument needs a name of up to ${PLAN_LIMITS.instrumentLength} characters`,
  );
  need('instruments', new Set(p.instruments.map((i) => i.trim().toUpperCase())).size === p.instruments.length, 'Each instrument should be listed once');
  need('sessions', p.sessions.length > 0, 'Choose the sessions you will trade');
  need('timeframes', p.timeframes.length > 0, 'Choose at least one timeframe');
  for (const field of ['entryRules', 'exitRules', 'stopRules', 'stopTradingWhen'] as const) {
    need(field, p[field].trim().length > 0, 'This part of the plan is required');
  }
  for (const field of ['entryRules', 'exitRules', 'stopRules', 'targetRules', 'stopTradingWhen', 'notes'] as const) {
    need(field, p[field].length <= PLAN_LIMITS.text, `Keep this under ${PLAN_LIMITS.text} characters`);
  }
  const r = RISK_RULE_LIMITS.maxRiskPerTradePercent;
  need('riskPerTradePercent', inRange(p.riskPerTradePercent, r), `Risk per trade must be between ${r.min}% and ${r.max}%`);
  const d = RISK_RULE_LIMITS.maxDailyLossPercent;
  need('dailyLossPercent', inRange(p.dailyLossPercent, d), `Daily loss limit must be between ${d.min}% and ${d.max}%`);
  const t = PLAN_LIMITS.maxTradesPerDay;
  need('maxTradesPerDay', inRange(p.maxTradesPerDay, t) && Number.isInteger(p.maxTradesPerDay), `Trades per day must be a whole number from ${t.min} to ${t.max}`);
  // Only compared when the risk itself is valid, so one bad number gives one message.
  need('dailyLossPercent', !inRange(p.riskPerTradePercent, r) || !(p.dailyLossPercent < p.riskPerTradePercent), 'The daily loss limit is smaller than one trade’s risk, so one loss would break it');
  return out;
}

/** Fields whose values differ between two versions, for "what changed" in the version history. */
export function changedFields(before: TradingPlan, after: TradingPlan): readonly PlanField[] {
  return (Object.keys(after) as PlanField[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}
