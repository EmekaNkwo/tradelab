import { z } from 'zod';
import {
  BACKTEST_TIMEFRAMES,
  CONDITION_OPS,
  definitionIssues,
  INDICATOR_KINDS,
  REGIMES,
  type BacktestCosts,
  type ConditionGroup,
  type DatasetSpec,
  type IndicatorOperand,
  type Regime,
  type Operand,
  type SplitRule,
  type StrategyDefinition,
} from '../../domain/backtest';
import { isTypedNumber } from '../../shared/decimal';

/**
 * Schemas for stored strategies and runs, and for the backtest templates in
 * content. A stored definition must also pass the domain's own validation,
 * so a hand-edited row or backup can never reach the engine.
 */

const timeframe = z.enum(BACKTEST_TIMEFRAMES as unknown as readonly ['H1', ...string[]]) as unknown as z.ZodType<StrategyDefinition['timeframe']>;

const indicatorOperand = z
  .object({
    kind: z.literal('indicator'),
    indicator: z.enum(INDICATOR_KINDS as unknown as readonly ['close', ...string[]]),
    period: z.number().int().nullable(),
    ago: z.number().int(),
    times: z.number(),
  })
  .strict() as unknown as z.ZodType<IndicatorOperand>;

const operand = z.union([indicatorOperand, z.object({ kind: z.literal('number'), value: z.number() }).strict()]) as unknown as z.ZodType<Operand>;

const group = z
  .object({
    join: z.enum(['all', 'any']),
    conditions: z.array(z.object({ left: indicatorOperand, op: z.enum(CONDITION_OPS as unknown as readonly ['above', ...string[]]), right: operand }).strict()),
  })
  .strict() as unknown as z.ZodType<ConditionGroup>;

const definitionShape = z
  .object({
    instrumentId: z.string(),
    timeframe,
    direction: z.enum(['long', 'short', 'both']),
    longEntry: group.nullable(),
    shortEntry: group.nullable(),
    longExit: group.nullable(),
    shortExit: group.nullable(),
    stop: z.union([
      z.object({ kind: z.literal('atr'), period: z.number().int(), multiple: z.number() }).strict(),
      z.object({ kind: z.literal('percent'), percent: z.number() }).strict(),
      z.object({ kind: z.literal('channel'), period: z.number().int() }).strict(),
    ]),
    target: z.union([z.object({ kind: z.literal('none') }).strict(), z.object({ kind: z.literal('r_multiple'), r: z.number() }).strict()]),
    riskPercent: z.number(),
    limits: z
      .object({ maxTradesPerDay: z.number().int(), dailyLossPercent: z.number().nullable(), pauseAfterLosses: z.number().int().nullable() })
      .strict(),
    session: z.object({ startHourUtc: z.number().int(), endHourUtc: z.number().int() }).strict().nullable(),
  })
  .strict();

export const strategyDefinitionSchema = definitionShape.superRefine((d, ctx) => {
  for (const issue of definitionIssues(d as StrategyDefinition)) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.field.split('.') });
}) as unknown as z.ZodType<StrategyDefinition>;

const number = z.string().refine(isTypedNumber, 'must be a number');

export const costsSchema = z
  .object({ spread: number, slippage: number, commissionPerSide: number, swapLong: number, swapShort: number })
  .strict() satisfies z.ZodType<BacktestCosts>;

export const datasetSpecSchema = z
  .object({ instrumentId: z.string(), timeframe, seed: z.number().int().min(0), candles: z.number().int().min(1), datasetId: z.string().min(1).max(80).optional(), contentHash: z.string().regex(/^[0-9a-f]{64}$/).optional(), dataLabel: z.string().min(1).max(200).optional() })
  .strict() as unknown as z.ZodType<DatasetSpec>;

export const splitSchema = z.union([
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('holdout'), inSamplePercent: z.number() }).strict(),
  z.object({ kind: z.literal('walk_forward'), folds: z.number().int() }).strict(),
]) satisfies z.ZodType<SplitRule>;

export interface RunInputs {
  readonly dataset: DatasetSpec;
  readonly capital: string;
  readonly costs: BacktestCosts;
  readonly split: SplitRule;
  /** Versions of the strategy that existed when it ran, for the overfitting warning. */
  readonly versionsTried: number;
  /** Other versions whose out-of-sample results had been shown before this run. */
  readonly otherVersionsWithOutOfSample: number;
}

export const runInputsSchema = z
  .object({ dataset: datasetSpecSchema, capital: number, costs: costsSchema, split: splitSchema, versionsTried: z.number().int().min(1), otherVersionsWithOutOfSample: z.number().int().min(0).default(0) })
  .strict() as unknown as z.ZodType<RunInputs>;

const stats = {
  trades: z.number().int().min(0),
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  winRate: z.number().nullable(),
  averageWin: z.number().nullable(),
  averageLoss: z.number().nullable(),
  expectancy: z.number().nullable(),
  expectancyR: z.number().nullable(),
  profitFactor: z.number().nullable(),
  net: z.number(),
};

/** What is stored of a result: everything except the trades. */
export const storedResultSchema = z
  .object({
    /** Missing on runs saved before the field existed (version 0). */
    resultSchemaVersion: z.number().int().min(0).default(0),
    engineVersion: z.number().int(),
    inputHash: z.string(),
    fingerprint: z.string(),
    dataLabel: z.string(),
    dataDescription: z.string(),
    candles: z.number().int(),
    warmup: z.number().int(),
    tradeCount: z.number().int().min(0),
    metrics: z
      .object({
        ...stats,
        startingCapital: z.number(),
        finalEquity: z.number(),
        netReturn: z.number(),
        largestGain: z.number().nullable(),
        largestLoss: z.number().nullable(),
        maxDrawdown: z.number(),
        averageDrawdown: z.number(),
        exposure: z.number(),
        turnover: z.number(),
        averageHoldingCandles: z.number().nullable(),
        commissionAndSwap: z.number(),
      })
      .strict(),
    byRegime: z.array(z.object({ regime: z.enum(REGIMES as unknown as readonly [Regime, ...Regime[]]), ...stats }).strict()),
    split: z.array(z.object({ label: z.string(), fromIndex: z.number().int(), toIndex: z.number().int(), ...stats }).strict()),
    splitExcluded: z.number().int().min(0).default(0),
    equityCurve: z.array(z.number()).max(1000),
    drawdownCurve: z.array(z.number()).max(1000),
    skipped: z.record(z.string(), z.number().int().min(0)),
    dataCheck: z.object({ errors: z.array(z.string()), warnings: z.array(z.string()) }).strict(),
    warnings: z.array(z.string()),
    conventions: z.array(z.string()),
  })
  .strict();

export type StoredResult = z.infer<typeof storedResultSchema>;

/** Parses stored JSON with a schema; null when it is not valid. */
export function parseJson<T>(schema: z.ZodType<T>, json: unknown): T | null {
  if (typeof json !== 'string') return null;
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
