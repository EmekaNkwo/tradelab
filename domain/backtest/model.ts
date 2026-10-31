import type { Timeframe } from '../models/markets';

/**
 * A learner's rules-based strategy (spec §16.2), built from tappable blocks.
 * Plain JSON (numbers and strings) so it can be stored, hashed and compared.
 * Evaluation is deterministic: the same definition on the same candles
 * always gives the same signals.
 */

/** Values a condition can read. Channels are the `period` candles before the current one. */
export type IndicatorKind =
  | 'close'
  | 'open'
  | 'high'
  | 'low'
  | 'sma'
  | 'ema'
  | 'rsi'
  | 'atr'
  | 'channel_high'
  | 'channel_low'
  | 'bollinger_upper'
  | 'bollinger_middle'
  | 'bollinger_lower'
  | 'volume'
  | 'volume_sma';

export const INDICATOR_KINDS: readonly IndicatorKind[] = [
  'close',
  'open',
  'high',
  'low',
  'sma',
  'ema',
  'rsi',
  'atr',
  'channel_high',
  'channel_low',
  'bollinger_upper',
  'bollinger_middle',
  'bollinger_lower',
  'volume',
  'volume_sma',
];

/** Kinds that take a period. */
export const PERIOD_KINDS: ReadonlySet<IndicatorKind> = new Set([
  'sma',
  'ema',
  'rsi',
  'atr',
  'channel_high',
  'channel_low',
  'bollinger_upper',
  'bollinger_middle',
  'bollinger_lower',
  'volume_sma',
]);

export interface IndicatorOperand {
  readonly kind: 'indicator';
  readonly indicator: IndicatorKind;
  /** Required for `PERIOD_KINDS`, ignored otherwise. */
  readonly period: number | null;
  /** Read the value this many candles back (0 = the candle that just closed). Never the future. */
  readonly ago: number;
  /** Multiply the value, e.g. 1.5 × average volume. 1 means as is. */
  readonly times: number;
}

export interface NumberOperand {
  readonly kind: 'number';
  readonly value: number;
}

export type Operand = IndicatorOperand | NumberOperand;

export type ConditionOp = 'above' | 'below' | 'crosses_above' | 'crosses_below';
export const CONDITION_OPS: readonly ConditionOp[] = ['above', 'below', 'crosses_above', 'crosses_below'];

export interface Condition {
  readonly left: IndicatorOperand;
  readonly op: ConditionOp;
  readonly right: Operand;
}

export interface ConditionGroup {
  /** `all` = every condition (AND); `any` = at least one (OR). */
  readonly join: 'all' | 'any';
  readonly conditions: readonly Condition[];
}

export type StopRule =
  | { readonly kind: 'atr'; readonly period: number; readonly multiple: number }
  | { readonly kind: 'percent'; readonly percent: number }
  /** Beyond the lowest low (long) or highest high (short) of the previous `period` candles. */
  | { readonly kind: 'channel'; readonly period: number };

export type TargetRule = { readonly kind: 'none' } | { readonly kind: 'r_multiple'; readonly r: number };

export type TradeDirection = 'long' | 'short' | 'both';

export interface RiskLimits {
  /** Simulated days: no new entries after this many in one UTC day. */
  readonly maxTradesPerDay: number;
  /** No new entries for the rest of the day once the day's realised loss reaches this % of the day's starting balance. */
  readonly dailyLossPercent: number | null;
  /** No new entries for the rest of the day after this many losing trades in a row. */
  readonly pauseAfterLosses: number | null;
}

/** Entries only when the signal candle opens inside this UTC window (start inclusive, end exclusive; may wrap midnight). */
export interface SessionFilter {
  readonly startHourUtc: number;
  readonly endHourUtc: number;
}

export interface StrategyDefinition {
  readonly instrumentId: string;
  readonly timeframe: Timeframe;
  readonly direction: TradeDirection;
  /** Required when the direction includes longs / shorts. */
  readonly longEntry: ConditionGroup | null;
  readonly shortEntry: ConditionGroup | null;
  /** Optional rule exits, checked on each close while a trade is open. */
  readonly longExit: ConditionGroup | null;
  readonly shortExit: ConditionGroup | null;
  readonly stop: StopRule;
  readonly target: TargetRule;
  /** Percent of equity lost if the stop fills at its level, costs included. */
  readonly riskPercent: number;
  readonly limits: RiskLimits;
  readonly session: SessionFilter | null;
}

export const BACKTEST_TIMEFRAMES: readonly Timeframe[] = ['M15', 'H1', 'H4', 'D1'];

/** Bounds the builder and validation share. */
export const DEFINITION_LIMITS = {
  period: { min: 2, max: 200 },
  ago: { min: 0, max: 50 },
  times: { min: 0.1, max: 10 },
  conditionsPerGroup: { min: 1, max: 6 },
  atrMultiple: { min: 0.5, max: 10 },
  stopPercent: { min: 0.1, max: 20 },
  targetR: { min: 0.5, max: 10 },
  riskPercent: { min: 0.1, max: 5 },
  maxTradesPerDay: { min: 1, max: 20 },
  dailyLossPercent: { min: 0.5, max: 20 },
  pauseAfterLosses: { min: 1, max: 20 },
} as const;
