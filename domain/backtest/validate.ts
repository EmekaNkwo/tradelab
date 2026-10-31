import { PRACTICE_INSTRUMENTS } from '../simulation/instruments';
import {
  BACKTEST_TIMEFRAMES,
  CONDITION_OPS,
  DEFINITION_LIMITS as L,
  INDICATOR_KINDS,
  PERIOD_KINDS,
  type Condition,
  type ConditionGroup,
  type Operand,
  type StrategyDefinition,
} from './model';

/** A problem with a strategy definition; `field` names the part of the builder to fix. */
export interface DefinitionIssue {
  readonly field: string;
  readonly message: string;
}

const between = (v: number, r: { readonly min: number; readonly max: number }) => Number.isFinite(v) && v >= r.min && v <= r.max;
const wholeBetween = (v: number, r: { readonly min: number; readonly max: number }) => Number.isInteger(v) && between(v, r);

function operandIssues(o: Operand, field: string): DefinitionIssue[] {
  if (o.kind === 'number') return Number.isFinite(o.value) ? [] : [{ field, message: 'Enter a number' }];
  const issues: DefinitionIssue[] = [];
  if (!INDICATOR_KINDS.includes(o.indicator)) issues.push({ field, message: 'Choose a value to compare' });
  if (PERIOD_KINDS.has(o.indicator) && !wholeBetween(o.period ?? NaN, L.period)) {
    issues.push({ field, message: `Period must be a whole number from ${L.period.min} to ${L.period.max}` });
  }
  if (!wholeBetween(o.ago, L.ago)) issues.push({ field, message: `"Candles ago" must be a whole number from ${L.ago.min} to ${L.ago.max}` });
  if (!between(o.times, L.times)) issues.push({ field, message: `The multiplier must be from ${L.times.min} to ${L.times.max}` });
  return issues;
}

function conditionIssues(c: Condition, field: string): DefinitionIssue[] {
  const issues = [...operandIssues(c.left, `${field}.left`), ...operandIssues(c.right, `${field}.right`)];
  if (!CONDITION_OPS.includes(c.op)) issues.push({ field, message: 'Choose how to compare' });
  if (c.right.kind === 'indicator' && c.left.indicator === c.right.indicator && c.left.period === c.right.period && c.left.ago === c.right.ago && c.left.times === c.right.times) {
    issues.push({ field, message: 'A value compared with itself is never true or always true' });
  }
  return issues;
}

function groupIssues(g: ConditionGroup | null, field: string, required: boolean): DefinitionIssue[] {
  if (!g) return required ? [{ field, message: 'Add at least one condition' }] : [];
  if (g.join !== 'all' && g.join !== 'any') return [{ field, message: 'Choose "all" or "any"' }];
  if (!wholeBetween(g.conditions.length, L.conditionsPerGroup)) {
    return [{ field, message: `Use ${L.conditionsPerGroup.min} to ${L.conditionsPerGroup.max} conditions` }];
  }
  return g.conditions.flatMap((c, i) => conditionIssues(c, `${field}.${i}`));
}

/** Every problem with a definition; an empty list means it can be saved and run. */
export function definitionIssues(d: StrategyDefinition): readonly DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const instrument = PRACTICE_INSTRUMENTS.find((i) => i.id === d.instrumentId);
  if (!instrument) issues.push({ field: 'instrumentId', message: 'Choose a practice market' });
  if (!BACKTEST_TIMEFRAMES.includes(d.timeframe)) issues.push({ field: 'timeframe', message: 'Choose a timeframe' });
  if (!['long', 'short', 'both'].includes(d.direction)) issues.push({ field: 'direction', message: 'Choose long, short or both' });
  const longs = d.direction !== 'short';
  const shorts = d.direction !== 'long';
  if (shorts && instrument && !instrument.allowShort) issues.push({ field: 'direction', message: 'This practice market can only be bought, so use long only' });
  issues.push(...groupIssues(longs ? d.longEntry : null, 'longEntry', longs));
  issues.push(...groupIssues(shorts ? d.shortEntry : null, 'shortEntry', shorts));
  issues.push(...groupIssues(longs ? d.longExit : null, 'longExit', false));
  issues.push(...groupIssues(shorts ? d.shortExit : null, 'shortExit', false));
  const s = d.stop;
  if (s.kind === 'atr') {
    if (!wholeBetween(s.period, L.period)) issues.push({ field: 'stop', message: `ATR period must be a whole number from ${L.period.min} to ${L.period.max}` });
    if (!between(s.multiple, L.atrMultiple)) issues.push({ field: 'stop', message: `ATR multiple must be from ${L.atrMultiple.min} to ${L.atrMultiple.max}` });
  } else if (s.kind === 'percent') {
    if (!between(s.percent, L.stopPercent)) issues.push({ field: 'stop', message: `Stop distance must be from ${L.stopPercent.min}% to ${L.stopPercent.max}%` });
  } else if (s.kind === 'channel') {
    if (!wholeBetween(s.period, L.period)) issues.push({ field: 'stop', message: `Channel period must be a whole number from ${L.period.min} to ${L.period.max}` });
  } else {
    issues.push({ field: 'stop', message: 'Every strategy needs a stop' });
  }
  if (d.target.kind === 'r_multiple' && !between(d.target.r, L.targetR)) issues.push({ field: 'target', message: `Target must be from ${L.targetR.min}R to ${L.targetR.max}R` });
  if (!between(d.riskPercent, L.riskPercent)) issues.push({ field: 'riskPercent', message: `Risk per trade must be from ${L.riskPercent.min}% to ${L.riskPercent.max}%` });
  if (!wholeBetween(d.limits.maxTradesPerDay, L.maxTradesPerDay)) issues.push({ field: 'limits', message: `Trades per day must be from ${L.maxTradesPerDay.min} to ${L.maxTradesPerDay.max}` });
  if (d.limits.dailyLossPercent !== null && !between(d.limits.dailyLossPercent, L.dailyLossPercent)) {
    issues.push({ field: 'limits', message: `Daily loss limit must be from ${L.dailyLossPercent.min}% to ${L.dailyLossPercent.max}%` });
  }
  if (d.limits.pauseAfterLosses !== null && !wholeBetween(d.limits.pauseAfterLosses, L.pauseAfterLosses)) {
    issues.push({ field: 'limits', message: `Pause after ${L.pauseAfterLosses.min} to ${L.pauseAfterLosses.max} losses` });
  }
  if (d.session) {
    const hour = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
    if (!hour(d.session.startHourUtc) || !hour(d.session.endHourUtc) || d.session.startHourUtc === d.session.endHourUtc) {
      issues.push({ field: 'session', message: 'Session hours must be different whole hours from 0 to 23 (UTC)' });
    }
  }
  return issues;
}
