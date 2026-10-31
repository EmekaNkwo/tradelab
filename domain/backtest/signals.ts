import { atr, bollinger, ema, priceChannel, rsi, sma, type Series } from '../market/indicators';
import type { Candle } from '../models/markets';
import type { Condition, ConditionGroup, IndicatorKind, IndicatorOperand, Operand, StopRule, StrategyDefinition } from './model';
import { PERIOD_KINDS } from './model';
import { drainSteps, type Steps } from './stepwise';

/**
 * Signal evaluation (spec §16.2–16.3). Every indicator here is causal: its
 * value at candle i uses candles 0..i only, and conditions read index
 * i − `ago` (never i + 1). Running on a shorter prefix of the same candles
 * gives the same signals for every candle in that prefix, which the tests
 * check; that is what makes look-ahead impossible.
 */

export interface PreparedSeries {
  readonly length: number;
  readonly values: ReadonlyMap<string, Series>;
}

const key = (kind: IndicatorKind, period: number | null) => (PERIOD_KINDS.has(kind) ? `${kind}:${period}` : kind);

/**
 * Simple average of the last `period` values; null while the window holds a
 * missing value, and known again as soon as the gap has left the window.
 */
export function windowAverage(values: readonly (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let total = 0;
  let missing = 0;
  values.forEach((v, i) => {
    if (v === null) missing += 1;
    else total += v;
    const leaving = i >= period ? values[i - period] : undefined;
    if (leaving !== undefined) {
      if (leaving === null) missing -= 1;
      else total -= leaving;
    }
    out.push(i >= period - 1 && missing === 0 ? total / period : null);
  });
  return out;
}

function computeSeries(kind: IndicatorKind, period: number, n: { open: number[]; high: number[]; low: number[]; close: number[]; volume: (number | null)[] }): Series {
  switch (kind) {
    case 'close':
      return n.close;
    case 'open':
      return n.open;
    case 'high':
      return n.high;
    case 'low':
      return n.low;
    case 'volume':
      return n.volume;
    case 'sma':
      return sma(n.close, period);
    case 'ema':
      return ema(n.close, period);
    case 'rsi':
      return rsi(n.close, period);
    case 'atr':
      return atr(n.close.map((close, i) => ({ open: n.open[i] as number, high: n.high[i] as number, low: n.low[i] as number, close })), period);
    case 'channel_high':
      return priceChannel(n.close.map((_c, i) => ({ high: n.high[i] as number, low: n.low[i] as number })), period).upper;
    case 'channel_low':
      return priceChannel(n.close.map((_c, i) => ({ high: n.high[i] as number, low: n.low[i] as number })), period).lower;
    case 'bollinger_upper':
      return bollinger(n.close, period).upper;
    case 'bollinger_middle':
      return bollinger(n.close, period).middle;
    case 'bollinger_lower':
      return bollinger(n.close, period).lower;
    case 'volume_sma':
      return windowAverage(n.volume, period);
  }
}

function operands(g: ConditionGroup | null): IndicatorOperand[] {
  return (g?.conditions ?? []).flatMap((c) => [c.left, ...(c.right.kind === 'indicator' ? [c.right] : [])]);
}

/** Every series the definition reads, computed once over the whole candle list. */
export function prepareSeries(def: StrategyDefinition, candles: readonly Candle[]): PreparedSeries {
  return drainSteps(prepareSeriesStepwise(def, candles, candles.length));
}

function neededSeries(def: StrategyDefinition): Map<string, { kind: IndicatorKind; period: number }> {
  const needed = new Map<string, { kind: IndicatorKind; period: number }>();
  const add = (kind: IndicatorKind, period: number | null) => needed.set(key(kind, period), { kind, period: period ?? 0 });
  for (const o of [...operands(def.longEntry), ...operands(def.shortEntry), ...operands(def.longExit), ...operands(def.shortExit)]) add(o.indicator, o.period);
  add('close', null);
  add('high', null);
  add('low', null);
  if (def.stop.kind === 'atr') add('atr', def.stop.period);
  if (def.stop.kind === 'channel') {
    add('channel_high', def.stop.period);
    add('channel_low', def.stop.period);
  }
  return needed;
}

/**
 * `prepareSeries` in steps (ADR 0006): the prices are read into numbers
 * `chunk` candles at a time, then each indicator series is one step. Same
 * series as one call.
 */
export function* prepareSeriesStepwise(def: StrategyDefinition, candles: readonly Candle[], chunk: number): Steps<PreparedSeries> {
  const size = Math.max(1, Math.floor(chunk));
  const n = { open: [] as number[], high: [] as number[], low: [] as number[], close: [] as number[], volume: [] as (number | null)[] };
  for (let from = 0; from < candles.length; from += size) {
    if (from > 0) yield;
    for (let i = from; i < Math.min(candles.length, from + size); i += 1) {
      const c = candles[i] as Candle;
      n.open.push(c.open.toNumber());
      n.high.push(c.high.toNumber());
      n.low.push(c.low.toNumber());
      n.close.push(c.close.toNumber());
      n.volume.push(c.volume ? c.volume.toNumber() : null);
    }
  }
  const values = new Map<string, Series>();
  for (const [k, { kind, period }] of neededSeries(def)) {
    yield;
    values.set(k, computeSeries(kind, period, n));
  }
  return { length: candles.length, values };
}

const at = (s: Series | undefined, i: number): number | null => (s && i >= 0 && i < s.length ? (s[i] ?? null) : null);

/** Value of an operand on candle i, or null when it is not known yet. */
export function operandAt(o: Operand, p: PreparedSeries, i: number): number | null {
  if (o.kind === 'number') return o.value;
  const v = at(p.values.get(key(o.indicator, o.period)), i - o.ago);
  return v === null ? null : v * o.times;
}

export function conditionAt(c: Condition, p: PreparedSeries, i: number): boolean {
  const l = operandAt(c.left, p, i);
  const r = operandAt(c.right, p, i);
  if (l === null || r === null) return false;
  if (c.op === 'above') return l > r;
  if (c.op === 'below') return l < r;
  const pl = operandAt(c.left, p, i - 1);
  const pr = operandAt(c.right, p, i - 1);
  if (pl === null || pr === null) return false;
  return c.op === 'crosses_above' ? l > r && pl <= pr : l < r && pl >= pr;
}

/** True when the group's conditions hold on candle i: all of them, or any one. */
export function groupAt(g: ConditionGroup | null, p: PreparedSeries, i: number): boolean {
  if (!g || g.conditions.length === 0) return false;
  return g.join === 'all' ? g.conditions.every((c) => conditionAt(c, p, i)) : g.conditions.some((c) => conditionAt(c, p, i));
}

/** Stop level for a trade signalled on candle i from mid price `reference`, or null when it cannot be worked out yet. */
export function stopLevel(stop: StopRule, side: 'buy' | 'sell', p: PreparedSeries, i: number, reference: number): number | null {
  const buy = side === 'buy';
  if (stop.kind === 'percent') return reference * (1 + ((buy ? -1 : 1) * stop.percent) / 100);
  if (stop.kind === 'atr') {
    const a = at(p.values.get(key('atr', stop.period)), i);
    return a === null ? null : reference + (buy ? -1 : 1) * a * stop.multiple;
  }
  // The previous `period` candles' extreme; the channel series already leaves out candle i.
  const level = at(p.values.get(key(buy ? 'channel_low' : 'channel_high', stop.period)), i);
  return level;
}
