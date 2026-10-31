import { dec } from '../../shared/decimal';
import type { UtcIso } from '../../shared/time';
import type { Candle, Timeframe } from '../models/markets';
import { createRng, type Rng } from './random';

/**
 * Deterministic scenario generator (spec §13.3). Same kind + seed + options
 * always gives the same candles. Output is labelled "Simulated scenario" and
 * models only broad behaviour (trends, ranges, breakouts, volatility shifts,
 * gaps, shocks). It does not reproduce real market mechanics such as order
 * books, sessions, weekends, or news timing.
 */

export const SCENARIO_KINDS = [
  'strong_uptrend',
  'downtrend',
  'range',
  'breakout',
  'false_breakout',
  'pullback',
  'reversal',
  'high_volatility',
  'low_volatility',
  'news_shock',
  'crash',
  'recovery',
  'sideways',
] as const;

export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

export const SIMULATED_LABEL = 'Simulated scenario';

export const TIMEFRAME_MINUTES: Readonly<Record<Timeframe, number>> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
  W1: 10080,
};

export type TrendDirection = 'up' | 'down' | 'sideways';

/** What actually happens in the scenario; used by drills to give feedback. */
export interface ScenarioTruth {
  readonly overallTrend: TrendDirection;
  /** Index of the key event (breakout, shock, reversal) if the scenario has one. */
  readonly keyIndex: number | null;
  /** For range-based scenarios: the range before the key event. */
  readonly rangeHigh: number | null;
  readonly rangeLow: number | null;
}

export interface Scenario {
  readonly kind: ScenarioKind;
  readonly seed: number;
  readonly label: typeof SIMULATED_LABEL;
  readonly timeframe: Timeframe;
  readonly candles: readonly Candle[];
  readonly truth: ScenarioTruth;
}

export interface ScenarioOptions {
  readonly kind: ScenarioKind;
  readonly seed: number;
  readonly count?: number;
  readonly startPrice?: number;
  readonly startTime?: UtcIso;
  readonly timeframe?: Timeframe;
  /** Decimal places for prices, e.g. 5 for EUR/USD. */
  readonly precision?: number;
}

/** One stretch of behaviour: drift and volatility as fractions of price per candle. */
interface Segment {
  readonly length: number;
  readonly drift: number;
  readonly vol: number;
  /** Pull back towards the segment's starting price (0 = none); creates ranges. */
  readonly meanRevert?: number;
  /** One-off jump at the start of the segment, as a fraction of price. */
  readonly jump?: number;
}

const BASE_VOL = 0.0012;

function segmentsFor(kind: ScenarioKind, n: number, rng: Rng, scale: number): { segments: Segment[]; trend: TrendDirection; keyAt: number | null } {
  const part = (f: number) => Math.max(1, Math.round(n * f));
  // Longer candles move more: per-candle moves grow with the square root of the candle's duration.
  const v = BASE_VOL * scale;
  const breakDir = rng.next() < 0.5 ? 1 : -1;
  switch (kind) {
    case 'strong_uptrend':
      return { segments: [{ length: n, drift: v * 0.45, vol: v }], trend: 'up', keyAt: null };
    case 'downtrend':
      return { segments: [{ length: n, drift: -v * 0.35, vol: v }], trend: 'down', keyAt: null };
    case 'range':
      return { segments: [{ length: n, drift: 0, vol: v, meanRevert: 0.08 }], trend: 'sideways', keyAt: null };
    case 'sideways':
      return { segments: [{ length: n, drift: 0, vol: v * 0.6, meanRevert: 0.12 }], trend: 'sideways', keyAt: null };
    case 'breakout': {
      const a = part(0.6);
      return {
        segments: [
          { length: a, drift: 0, vol: v * 0.7, meanRevert: 0.15 },
          { length: n - a, drift: breakDir * v * 0.6, vol: v * 1.2, jump: breakDir * v * 3 },
        ],
        trend: breakDir > 0 ? 'up' : 'down',
        keyAt: a,
      };
    }
    case 'false_breakout': {
      const a = part(0.6);
      const b = part(0.08);
      return {
        segments: [
          { length: a, drift: 0, vol: v * 0.7, meanRevert: 0.15 },
          { length: b, drift: breakDir * v * 0.8, vol: v, jump: breakDir * v * 3 },
          { length: n - a - b, drift: -breakDir * v * 0.5, vol: v },
        ],
        trend: breakDir > 0 ? 'down' : 'up',
        keyAt: a,
      };
    }
    case 'pullback': {
      const a = part(0.45);
      const b = part(0.2);
      return {
        segments: [
          { length: a, drift: v * 0.45, vol: v },
          { length: b, drift: -v * 0.4, vol: v * 0.9 },
          { length: n - a - b, drift: v * 0.45, vol: v },
        ],
        trend: 'up',
        keyAt: a,
      };
    }
    case 'reversal': {
      const a = part(0.5);
      return {
        segments: [
          { length: a, drift: v * 0.45, vol: v },
          { length: n - a, drift: -v * 0.5, vol: v * 1.1 },
        ],
        trend: 'down',
        keyAt: a,
      };
    }
    case 'high_volatility':
      return { segments: [{ length: n, drift: 0, vol: v * 3, meanRevert: 0.03 }], trend: 'sideways', keyAt: null };
    case 'low_volatility':
      return { segments: [{ length: n, drift: 0, vol: v * 0.3, meanRevert: 0.05 }], trend: 'sideways', keyAt: null };
    case 'news_shock': {
      const a = part(0.55);
      return {
        segments: [
          { length: a, drift: 0, vol: v * 0.7, meanRevert: 0.1 },
          { length: n - a, drift: breakDir * v * 0.1, vol: v * 2.2, jump: breakDir * v * 12 },
        ],
        trend: breakDir > 0 ? 'up' : 'down',
        keyAt: a,
      };
    }
    case 'crash': {
      const a = part(0.4);
      const b = part(0.2);
      return {
        segments: [
          { length: a, drift: v * 0.1, vol: v },
          { length: b, drift: -v * 2.5, vol: v * 2.5 },
          { length: n - a - b, drift: 0, vol: v * 1.8, meanRevert: 0.05 },
        ],
        trend: 'down',
        keyAt: a,
      };
    }
    case 'recovery': {
      const a = part(0.3);
      return {
        segments: [
          { length: a, drift: -v * 1.5, vol: v * 2 },
          { length: n - a, drift: v * 0.7, vol: v * 1.3 },
        ],
        trend: 'up',
        keyAt: a,
      };
    }
  }
}

function round(value: number, precision: number): string {
  return value.toFixed(precision);
}

export function generateScenario(options: ScenarioOptions): Scenario {
  const count = options.count ?? 300;
  const precision = options.precision ?? 5;
  const timeframe = options.timeframe ?? 'H1';
  const startMs = Date.parse(options.startTime ?? '2020-01-01T00:00:00.000Z');
  const stepMs = TIMEFRAME_MINUTES[timeframe] * 60_000;
  const minutes = TIMEFRAME_MINUTES[timeframe];
  // Each timeframe gets its own path (H1 keeps the plain seed) and moves sized for its candle length.
  const rng = createRng(minutes === 60 ? options.seed : options.seed + minutes * 7919);
  const scale = Math.sqrt(minutes / 60);
  const { segments, trend, keyAt } = segmentsFor(options.kind, count, rng, scale);
  const floor = 10 ** -precision;

  const candles: Candle[] = [];
  let price = options.startPrice ?? 1.1;
  let index = 0;
  let rangeHigh: number | null = null;
  let rangeLow: number | null = null;
  for (const seg of segments) {
    const anchor = price;
    for (let i = 0; i < seg.length && index < count; i += 1, index += 1) {
      const jump = i === 0 && seg.jump ? seg.jump : 0;
      const open = Math.max(floor, price * (1 + jump));
      const pull = seg.meanRevert ? (seg.meanRevert * (anchor - open)) / open : 0;
      const close = Math.max(floor, open * (1 + seg.drift + pull + seg.vol * rng.normal()));
      const wick = () => Math.abs(rng.normal()) * seg.vol * open * 0.6;
      const high = Math.max(open, close) + wick();
      const low = Math.max(floor, Math.min(open, close) - wick());
      const volume = Math.round(1000 * scale * (1 + Math.abs(close - open) / (BASE_VOL * scale * open)) * (0.7 + rng.next() * 0.6));
      candles.push({
        time: new Date(startMs + index * stepMs).toISOString() as UtcIso,
        open: dec(round(open, precision)),
        high: dec(round(high, precision)),
        low: dec(round(low, precision)),
        close: dec(round(close, precision)),
        volume: dec(volume),
      });
      if (keyAt !== null && index < keyAt) {
        rangeHigh = Math.max(rangeHigh ?? high, high);
        rangeLow = Math.min(rangeLow ?? low, low);
      }
      price = close;
    }
  }
  const ranged = keyAt !== null && (options.kind === 'breakout' || options.kind === 'false_breakout' || options.kind === 'news_shock');
  return {
    kind: options.kind,
    seed: options.seed,
    label: SIMULATED_LABEL,
    timeframe,
    candles,
    truth: {
      overallTrend: trend,
      keyIndex: keyAt,
      rangeHigh: ranged ? rangeHigh : null,
      rangeLow: ranged ? rangeLow : null,
    },
  };
}

/** Basic integrity checks run on any candle series before use (spec §30: validate on load). */
export function candleIssues(candles: readonly Candle[], from = 0, to = candles.length): readonly string[] {
  const issues: string[] = [];
  for (let i = Math.max(0, from); i < Math.min(to, candles.length); i += 1) {
    const c = candles[i] as Candle;
    if (c.high.lt(c.open) || c.high.lt(c.close) || c.low.gt(c.open) || c.low.gt(c.close) || c.low.gt(c.high)) {
      issues.push(`candle ${i}: high/low do not contain open/close`);
    }
    const t = Date.parse(c.time);
    if (typeof c.time !== 'string' || Number.isNaN(t)) {
      issues.push(`candle ${i}: time is not a valid timestamp`);
      continue;
    }
    const prev = candles[i - 1];
    const before = prev ? Date.parse(prev.time) : NaN;
    if (prev && !Number.isNaN(before) && t <= before) issues.push(`candle ${i}: time is not after the previous candle`);
  }
  return issues;
}
