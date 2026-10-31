import type { Timeframe } from '../../domain/models/markets';
import type { SessionId, TradingPlan } from '../../domain/plan';
import { isTypedNumber } from '../../shared/decimal';

/** The plan as typed in the builder: numbers stay text until saved, instruments are one comma-separated line. */
export interface PlanForm {
  readonly instruments: string;
  readonly sessions: readonly SessionId[];
  readonly timeframes: readonly Timeframe[];
  readonly entryRules: string;
  readonly exitRules: string;
  readonly stopRules: string;
  readonly targetRules: string;
  readonly riskPerTradePercent: string;
  readonly dailyLossPercent: string;
  readonly maxTradesPerDay: string;
  readonly stopTradingWhen: string;
  readonly notes: string;
}

/** A typed number, or NaN for anything else (so `planIssues` reports it). */
const num = (t: string) => {
  const v = t.trim().replace(',', '.');
  return isTypedNumber(v) ? Number(v) : Number.NaN;
};

export function formToPlan(f: PlanForm): TradingPlan {
  return {
    instruments: f.instruments
      .split(/[,\n]/)
      .map((i) => i.trim())
      .filter((i) => i.length > 0),
    sessions: [...f.sessions],
    timeframes: [...f.timeframes],
    entryRules: f.entryRules,
    exitRules: f.exitRules,
    stopRules: f.stopRules,
    targetRules: f.targetRules,
    riskPerTradePercent: num(f.riskPerTradePercent),
    dailyLossPercent: num(f.dailyLossPercent),
    maxTradesPerDay: num(f.maxTradesPerDay),
    stopTradingWhen: f.stopTradingWhen,
    notes: f.notes,
  };
}

export function planToForm(p: TradingPlan): PlanForm {
  return {
    instruments: p.instruments.join(', '),
    sessions: p.sessions,
    timeframes: p.timeframes,
    entryRules: p.entryRules,
    exitRules: p.exitRules,
    stopRules: p.stopRules,
    targetRules: p.targetRules,
    riskPerTradePercent: String(p.riskPerTradePercent),
    dailyLossPercent: String(p.dailyLossPercent),
    maxTradesPerDay: String(p.maxTradesPerDay),
    stopTradingWhen: p.stopTradingWhen,
    notes: p.notes,
  };
}

export const PLAN_FIELD_LABELS: Readonly<Record<keyof TradingPlan, string>> = {
  instruments: 'Instruments I trade',
  sessions: 'Sessions I trade',
  timeframes: 'Timeframes',
  entryRules: 'When I enter',
  exitRules: 'When I exit',
  stopRules: 'Where my stop goes',
  targetRules: 'Where my target goes',
  riskPerTradePercent: 'Risk per trade (% of equity)',
  dailyLossPercent: 'Stop for the day after losing (% of equity)',
  maxTradesPerDay: 'Most trades per day',
  stopTradingWhen: 'I stop trading or step back when',
  notes: 'Notes',
};
