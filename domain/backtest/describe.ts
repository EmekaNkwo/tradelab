import { practiceInstrument } from '../simulation/instruments';
import type { Condition, ConditionGroup, IndicatorKind, Operand, StrategyDefinition } from './model';

/** Plain-English reading of a strategy definition (spec §16.2). Built only from the definition, so it never drifts from the rules. */

export const INDICATOR_LABELS: Readonly<Record<IndicatorKind, string>> = {
  close: 'the close',
  open: 'the open',
  high: 'the high',
  low: 'the low',
  sma: 'the MA',
  ema: 'the EMA',
  rsi: 'RSI',
  atr: 'ATR',
  channel_high: 'the highest high',
  channel_low: 'the lowest low',
  bollinger_upper: 'the upper Bollinger band',
  bollinger_middle: 'the middle Bollinger band',
  bollinger_lower: 'the lower Bollinger band',
  volume: 'volume',
  volume_sma: 'the average volume',
};

const OP_LABELS: Readonly<Record<Condition['op'], string>> = {
  above: 'is above',
  below: 'is below',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
};

export function describeOperand(o: Operand): string {
  if (o.kind === 'number') return String(o.value);
  const channel = o.indicator === 'channel_high' || o.indicator === 'channel_low';
  const base = INDICATOR_LABELS[o.indicator];
  let text = o.period === null ? base : channel ? `${base} of the previous ${o.period} candles` : `${base} ${o.period}`;
  if (o.ago > 0) text += ` ${o.ago} candle${o.ago === 1 ? '' : 's'} ago`;
  if (o.times !== 1) text = `${o.times} × ${text}`;
  return text;
}

export const describeCondition = (c: Condition): string => `${describeOperand(c.left)} ${OP_LABELS[c.op]} ${describeOperand(c.right)}`;

export function describeGroup(g: ConditionGroup): string {
  const parts = g.conditions.map(describeCondition);
  if (parts.length === 1) return parts[0] as string;
  return `${g.join === 'all' ? 'all of' : 'any of'}: ${parts.join(g.join === 'all' ? '; and ' : '; or ')}`;
}

/** One sentence per part of the strategy, in the order a trader would read them. */
export function describeStrategy(d: StrategyDefinition): readonly string[] {
  const market = practiceInstrument(d.instrumentId)?.name ?? d.instrumentId;
  const out: string[] = [`Market: ${market}, ${d.timeframe} candles. Decisions are made when a candle closes; orders fill at the next candle’s open.`];
  if (d.direction !== 'short' && d.longEntry) out.push(`Buy when ${describeGroup(d.longEntry)}.`);
  if (d.direction !== 'long' && d.shortEntry) out.push(`Sell short when ${describeGroup(d.shortEntry)}.`);
  if (d.direction !== 'short' && d.longExit) out.push(`Close a long when ${describeGroup(d.longExit)}.`);
  if (d.direction !== 'long' && d.shortExit) out.push(`Close a short when ${describeGroup(d.shortExit)}.`);
  const stop =
    d.stop.kind === 'atr'
      ? `${d.stop.multiple} × ATR ${d.stop.period} from the signal candle’s close`
      : d.stop.kind === 'percent'
        ? `${d.stop.percent}% from the signal candle’s close`
        : `at the lowest low (for a long) or highest high (for a short) of the previous ${d.stop.period} candles`;
  out.push(`Stop loss: ${stop}.`);
  out.push(d.target.kind === 'r_multiple' ? `Take profit at ${d.target.r}R: ${d.target.r} times the distance to the stop.` : 'No take profit: trades close on the exit rule or the stop.');
  out.push(`Size: risk ${d.riskPercent}% of the account at the stop, costs included. One trade at a time.`);
  const limits = [`at most ${d.limits.maxTradesPerDay} new trade${d.limits.maxTradesPerDay === 1 ? '' : 's'} a day`];
  if (d.limits.dailyLossPercent !== null) limits.push(`no new trades after losing ${d.limits.dailyLossPercent}% in a day`);
  if (d.limits.pauseAfterLosses !== null) limits.push(`a pause for the rest of the day after ${d.limits.pauseAfterLosses} losses in a row`);
  out.push(`Limits: ${limits.join(', ')}.`);
  if (d.session) out.push(`Only enter between ${String(d.session.startHourUtc).padStart(2, '0')}:00 and ${String(d.session.endHourUtc).padStart(2, '0')}:00 UTC.`);
  return out;
}
