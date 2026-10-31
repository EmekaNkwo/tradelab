import { dec, type Decimal } from '../../shared/decimal';

/**
 * Risk rules set by the learner (spec §19). The defaults are learning
 * examples, not recommendations; screens say so. A violation always shows
 * the rule, the numbers, and a lesson to revisit. Nothing here ever suggests
 * a bigger size to win back a loss.
 */

export interface RiskRules {
  /** Largest planned loss per trade, as % of equity. */
  readonly maxRiskPerTradePercent: number;
  /** Stop trading for the day after losing this % of the day's starting balance. */
  readonly maxDailyLossPercent: number;
  readonly maxOpenPositions: number;
  /** Largest total margin in use, as % of equity. */
  readonly maxMarginUsePercent: number;
  /** Pause and review after this many losing trades in a row. */
  readonly reviewAfterLosses: number;
  /** A stop loss is required on every trade. */
  readonly requireStop: boolean;
}

/** Example values for practice. Change them in the risk rules screen. */
export const EXAMPLE_RISK_RULES: RiskRules = {
  maxRiskPerTradePercent: 1,
  maxDailyLossPercent: 3,
  maxOpenPositions: 3,
  maxMarginUsePercent: 30,
  reviewAfterLosses: 3,
  requireStop: true,
};

export const RISK_RULE_LIMITS = {
  maxRiskPerTradePercent: { min: 0.1, max: 10 },
  maxDailyLossPercent: { min: 0.5, max: 20 },
  maxOpenPositions: { min: 1, max: 20 },
  maxMarginUsePercent: { min: 1, max: 100 },
  reviewAfterLosses: { min: 1, max: 10 },
} as const;

export const RULE_IDS = ['risk_per_trade', 'no_stop', 'daily_loss', 'open_positions', 'margin_use', 'size_up_after_loss', 'stop_moved_away'] as const;
/** `stop_moved_away` is recorded when an open trade's stop is removed or moved to risk more. */
export type RuleId = (typeof RULE_IDS)[number];

/** Short names for summaries and reviews. */
export const RULE_SHORT_NAMES: Readonly<Record<RuleId, string>> = {
  no_stop: 'No stop loss',
  risk_per_trade: 'Risk above the per-trade limit',
  daily_loss: 'Traded past the daily loss limit',
  open_positions: 'Too many open positions',
  margin_use: 'Too much margin in use',
  size_up_after_loss: 'Sized up after a loss',
  stop_moved_away: 'Moved a stop to risk more',
};

/** The short name of a stored rule id, or the id itself for one this version does not know. */
export const ruleShortName = (rule: string): string => (RULE_SHORT_NAMES as Readonly<Record<string, string>>)[rule] ?? rule;

export interface RuleViolation {
  readonly rule: RuleId;
  /** The rule in words. */
  readonly ruleText: string;
  /** The numbers that broke it. */
  readonly calculation: string;
  /** A lesson to revisit (content id). */
  /** The lesson that explains the rule, or null until one exists. */
  readonly lessonId: string | null;
}

export interface OrderContext {
  readonly equity: Decimal;
  /** Loss at the stop for this order, or null when there is no stop. */
  readonly plannedRisk: Decimal | null;
  readonly openPositions: number;
  /** Margin in use if this order fills. */
  readonly marginAfter: Decimal;
  readonly dayStartBalance: Decimal;
  /** Realised result today (negative for a loss). */
  readonly dayRealised: Decimal;
  /** The previous closed trade, if any: was it a loss, and what did it risk? */
  readonly lastTrade: { readonly lost: boolean; readonly plannedRisk: Decimal | null } | null;
}

/** Percent of `whole`. With nothing left (whole ≤ 0) any positive part is over every limit, so it is infinite. */
const pct = (part: Decimal, whole: Decimal) => (whole.gt(0) ? part.div(whole).times(100) : part.gt(0) ? dec(Infinity) : dec(0));
const f2 = (d: Decimal) => (d.isFinite() ? d.toFixed(2) : 'more than 100');

/** Every rule this order would break. An empty list means it is within the learner's rules. */
export function checkOrder(rules: RiskRules, ctx: OrderContext): readonly RuleViolation[] {
  const out: RuleViolation[] = [];
  if (ctx.plannedRisk === null) {
    if (rules.requireStop) {
      out.push({
        rule: 'no_stop',
        ruleText: 'Every trade has a stop loss.',
        calculation: 'This order has no stop, so its risk is not defined.',
        lessonId: 'fx-sl-tp',
      });
    }
  } else {
    const riskPct = pct(ctx.plannedRisk, ctx.equity);
    if (riskPct.gt(rules.maxRiskPerTradePercent)) {
      out.push({
        rule: 'risk_per_trade',
        ruleText: `Risk at most ${rules.maxRiskPerTradePercent}% of equity per trade.`,
        calculation: `${f2(ctx.plannedRisk)} at the stop ÷ ${f2(ctx.equity)} equity = ${f2(riskPct)}%.`,
        lessonId: 'fx-pip-value',
      });
    }
    const last = ctx.lastTrade;
    if (last?.lost && last.plannedRisk && ctx.plannedRisk.gt(last.plannedRisk)) {
      out.push({
        rule: 'size_up_after_loss',
        ruleText: 'Do not raise risk to win back a loss.',
        calculation: `The last trade lost; it risked ${f2(last.plannedRisk)}. This one risks ${f2(ctx.plannedRisk)}.`,
        lessonId: 'fx-lot-sizes',
      });
    }
  }
  const lostToday = ctx.dayRealised.isNegative() ? ctx.dayRealised.abs() : dec(0);
  const dayLossPct = pct(lostToday, ctx.dayStartBalance);
  if (dayLossPct.gte(rules.maxDailyLossPercent)) {
    out.push({
      rule: 'daily_loss',
      ruleText: `Stop for the day after losing ${rules.maxDailyLossPercent}% of the day's starting balance.`,
      calculation: `Lost ${f2(lostToday)} today ÷ ${f2(ctx.dayStartBalance)} = ${f2(dayLossPct)}%.`,
      // No lesson covers a daily loss limit yet; a wrong link would mislead.
      lessonId: null,
    });
  }
  if (ctx.openPositions + 1 > rules.maxOpenPositions) {
    out.push({
      rule: 'open_positions',
      ruleText: `At most ${rules.maxOpenPositions} open positions.`,
      calculation: `This would be position ${ctx.openPositions + 1}.`,
      lessonId: 'fx-leverage-margin',
    });
  }
  const marginPct = pct(ctx.marginAfter, ctx.equity);
  if (marginPct.gt(rules.maxMarginUsePercent)) {
    out.push({
      rule: 'margin_use',
      ruleText: `Keep margin in use at or below ${rules.maxMarginUsePercent}% of equity.`,
      calculation: `${f2(ctx.marginAfter)} margin ÷ ${f2(ctx.equity)} equity = ${f2(marginPct)}%.`,
      lessonId: 'fx-leverage-margin',
    });
  }
  return out;
}

export interface CooldownState {
  readonly reason: 'losing_streak' | 'daily_loss';
  readonly message: string;
}

/** A pause prompt after a losing streak or the daily loss limit (spec §21). It never blocks study. */
export function cooldown(rules: RiskRules, consecutiveLosses: number, dayStartBalance: Decimal, dayRealised: Decimal): CooldownState | null {
  const lost = dayRealised.isNegative() ? dayRealised.abs() : dec(0);
  if (dayStartBalance.gt(0) && pct(lost, dayStartBalance).gte(rules.maxDailyLossPercent)) {
    return {
      reason: 'daily_loss',
      message: `You have reached your daily loss limit (${rules.maxDailyLossPercent}%). Stop trading for today and review your journal instead.`,
    };
  }
  if (consecutiveLosses >= rules.reviewAfterLosses) {
    return {
      reason: 'losing_streak',
      message: `${consecutiveLosses} losses in a row. Take a break, then review the trades: did you follow your plan? Losing streaks happen even with a sound plan; a bigger size will not undo them.`,
    };
  }
  return null;
}

/** Validates edited rules against `RISK_RULE_LIMITS`; returns the field names that are out of range. */
export function invalidRuleFields(rules: RiskRules): readonly (keyof typeof RISK_RULE_LIMITS)[] {
  return (Object.keys(RISK_RULE_LIMITS) as (keyof typeof RISK_RULE_LIMITS)[]).filter((k) => {
    const v = rules[k];
    const { min, max } = RISK_RULE_LIMITS[k];
    const wholeNumber = k === 'maxOpenPositions' || k === 'reviewAfterLosses';
    return !Number.isFinite(v) || v < min || v > max || (wholeNumber && !Number.isInteger(v));
  });
}
