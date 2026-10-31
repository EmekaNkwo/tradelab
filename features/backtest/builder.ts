import {
  DEFINITION_LIMITS as L,
  PERIOD_KINDS,
  type Condition,
  type ConditionGroup,
  type IndicatorKind,
  type IndicatorOperand,
  type Operand,
  type StrategyDefinition,
  templateFor,
} from '../../domain/backtest';

/**
 * Immutable edits for the Strategy Builder (spec §16.2). Every edit returns a
 * new definition; validation happens in the domain (`definitionIssues`).
 */

export type GroupKey = 'longEntry' | 'shortEntry' | 'longExit' | 'shortExit';
export const GROUP_KEYS: readonly GroupKey[] = ['longEntry', 'shortEntry', 'longExit', 'shortExit'];
export const GROUP_TITLES: Readonly<Record<GroupKey, string>> = { longEntry: 'Buy (long entry)', shortEntry: 'Sell short (short entry)', longExit: 'Close a long', shortExit: 'Close a short' };

/** Sensible starting periods when a block switches indicator. */
export const DEFAULT_PERIODS: Readonly<Partial<Record<IndicatorKind, number>>> = {
  sma: 20,
  ema: 50,
  rsi: 14,
  atr: 14,
  channel_high: 20,
  channel_low: 20,
  bollinger_upper: 20,
  bollinger_middle: 20,
  bollinger_lower: 20,
  volume_sma: 20,
};

export const operandOf = (indicator: IndicatorKind): IndicatorOperand => ({ kind: 'indicator', indicator, period: PERIOD_KINDS.has(indicator) ? (DEFAULT_PERIODS[indicator] ?? 20) : null, ago: 0, times: 1 });

export const NEW_CONDITION: Condition = { left: operandOf('close'), op: 'crosses_above', right: operandOf('ema') };

export const blankDefinition = (instrumentId = 'sim-eurusd'): StrategyDefinition => ({
  instrumentId,
  timeframe: 'H1',
  direction: 'long',
  longEntry: { join: 'all', conditions: [NEW_CONDITION] },
  shortEntry: null,
  longExit: { join: 'all', conditions: [{ left: operandOf('close'), op: 'crosses_below', right: operandOf('ema') }] },
  shortExit: null,
  stop: { kind: 'atr', period: 14, multiple: 2 },
  target: { kind: 'none' },
  riskPercent: 1,
  limits: { maxTradesPerDay: 3, dailyLossPercent: null, pauseAfterLosses: null },
  session: null,
});

/** Switching direction adds the groups the new direction needs, and keeps the others for switching back. */
export function withDirection(d: StrategyDefinition, direction: StrategyDefinition['direction']): StrategyDefinition {
  const mirror = (g: ConditionGroup | null): ConditionGroup | null =>
    g && { ...g, conditions: g.conditions.map((c) => ({ ...c, op: ({ above: 'below', below: 'above', crosses_above: 'crosses_below', crosses_below: 'crosses_above' } as const)[c.op] })) };
  const needsShort = direction !== 'long';
  const needsLong = direction !== 'short';
  return {
    ...d,
    direction,
    shortEntry: needsShort ? (d.shortEntry ?? mirror(d.longEntry) ?? { join: 'all', conditions: [NEW_CONDITION] }) : d.shortEntry,
    shortExit: needsShort ? (d.shortExit ?? mirror(d.longExit)) : d.shortExit,
    longEntry: needsLong ? (d.longEntry ?? mirror(d.shortEntry) ?? { join: 'all', conditions: [NEW_CONDITION] }) : d.longEntry,
    longExit: needsLong ? (d.longExit ?? mirror(d.shortExit)) : d.longExit,
  };
}

/** Groups not used by the direction are dropped before saving, so a saved version holds only rules that apply. */
export function forSaving(d: StrategyDefinition): StrategyDefinition {
  return {
    ...d,
    longEntry: d.direction === 'short' ? null : d.longEntry,
    longExit: d.direction === 'short' ? null : d.longExit,
    shortEntry: d.direction === 'long' ? null : d.shortEntry,
    shortExit: d.direction === 'long' ? null : d.shortExit,
  };
}

export function updateGroup(d: StrategyDefinition, key: GroupKey, f: (g: ConditionGroup) => ConditionGroup | null): StrategyDefinition {
  const g = d[key] ?? { join: 'all', conditions: [] };
  const next = f(g);
  return { ...d, [key]: next && next.conditions.length > 0 ? next : null };
}

export const addCondition = (d: StrategyDefinition, key: GroupKey): StrategyDefinition =>
  updateGroup(d, key, (g) => (g.conditions.length >= L.conditionsPerGroup.max ? g : { ...g, conditions: [...g.conditions, NEW_CONDITION] }));

export const removeCondition = (d: StrategyDefinition, key: GroupKey, index: number): StrategyDefinition =>
  updateGroup(d, key, (g) => ({ ...g, conditions: g.conditions.filter((_c, i) => i !== index) }));

export const setCondition = (d: StrategyDefinition, key: GroupKey, index: number, c: Condition): StrategyDefinition =>
  updateGroup(d, key, (g) => ({ ...g, conditions: g.conditions.map((x, i) => (i === index ? c : x)) }));

export const setJoin = (d: StrategyDefinition, key: GroupKey, join: ConditionGroup['join']): StrategyDefinition => updateGroup(d, key, (g) => ({ ...g, join }));

/** Changing the indicator resets the period to that indicator's default. */
export function withIndicator(o: Operand, indicator: IndicatorKind | 'number'): Operand {
  if (indicator === 'number') return { kind: 'number', value: o.kind === 'number' ? o.value : 30 };
  const base = operandOf(indicator);
  return o.kind === 'indicator' ? { ...base, ago: o.ago, times: o.times } : base;
}

/** Steps a number within its limits, rounding away floating-point noise. */
export function step(value: number, delta: number, range: { readonly min: number; readonly max: number }): number {
  const next = Math.round((value + delta) * 100) / 100;
  return Math.min(range.max, Math.max(range.min, next));
}

/** What a Strategy Library page links to in Phase 9 tools; null when nothing applies, so no empty section is shown. */
export type LabLink = { readonly kind: 'template'; readonly templateId: string; readonly simplifications: number } | { readonly kind: 'sandbox' } | { readonly kind: 'portfolio' };

export function labLinkFor(strategy: { readonly id: string; readonly category: string; readonly style: string }): LabLink | null {
  const t = templateFor(strategy.id);
  if (t) return { kind: 'template', templateId: t.strategyId, simplifications: t.simplifications.length };
  if (strategy.category === 'investing') return { kind: 'sandbox' };
  if (strategy.category === 'risk_principle') return { kind: 'portfolio' };
  return null;
}
