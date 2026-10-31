/**
 * Chart indicators (spec §13.1, §11): MA, EMA, RSI, MACD, ATR, Bollinger Bands,
 * and a price channel.
 * They work on plain numbers because they drive chart drawing over thousands
 * of candles; money and order maths stay in Decimal elsewhere. Each output has
 * the same length as the input, with null where there is not enough history.
 * Indicators describe the past; none of them is a signal that price will move.
 */

export type Series = readonly (number | null)[];

function check(period: number): void {
  if (!Number.isInteger(period) || period < 1) throw new RangeError('period must be a positive integer');
}

export function sma(values: readonly number[], period: number): Series {
  check(period);
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= period) sum -= values[i - period] as number;
    return i >= period - 1 ? sum / period : null;
  });
}

/** Exponential moving average, seeded with the SMA of the first `period` values. */
export function ema(values: readonly number[], period: number): Series {
  check(period);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  return values.map((v, i) => {
    if (i < period - 1) return null;
    if (prev === null) {
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      return prev;
    }
    prev = v * k + prev * (1 - k);
    return prev;
  });
}

/** Wilder's RSI (0–100). */
export function rsi(closes: readonly number[], period = 14): Series {
  check(period);
  let avgGain = 0;
  let avgLoss = 0;
  return closes.map((c, i) => {
    if (i === 0) return null;
    const change = c - (closes[i - 1] as number);
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i < period) return null;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
  });
}

export interface MacdResult {
  readonly macd: Series;
  readonly signal: Series;
  readonly histogram: Series;
}

export function macd(closes: readonly number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_c, i) => {
    const a = f[i];
    const b = s[i];
    return a == null || b == null ? null : a - b;
  });
  const firstIndex = line.findIndex((x) => x !== null);
  const signalTail = firstIndex < 0 ? [] : ema(line.slice(firstIndex) as number[], signalPeriod);
  const signal = line.map((_x, i) => (firstIndex < 0 || i < firstIndex ? null : (signalTail[i - firstIndex] ?? null)));
  const histogram = line.map((m, i) => {
    const sg = signal[i];
    return m == null || sg == null ? null : m - sg;
  });
  return { macd: line, signal, histogram };
}

export interface OhlcNumbers {
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/** Wilder's Average True Range. */
export function atr(candles: readonly OhlcNumbers[], period = 14): Series {
  check(period);
  const tr = candles.map((c, i) => {
    const prev = candles[i - 1];
    return prev ? Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)) : c.high - c.low;
  });
  let prev: number | null = null;
  return tr.map((t, i) => {
    if (i < period - 1) return null;
    if (prev === null) {
      prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
      return prev;
    }
    prev = (prev * (period - 1) + t) / period;
    return prev;
  });
}

export interface BollingerResult {
  readonly middle: Series;
  readonly upper: Series;
  readonly lower: Series;
}

/** Middle = SMA; bands = middle ± k × population standard deviation. */
export function bollinger(closes: readonly number[], period = 20, k = 2): BollingerResult {
  const middle = sma(closes, period);
  const width = closes.map((_c, i) => {
    const m = middle[i];
    if (m == null) return null;
    const window = closes.slice(i - period + 1, i + 1);
    return Math.sqrt(window.reduce((acc, x) => acc + (x - m) ** 2, 0) / period);
  });
  return {
    middle,
    upper: middle.map((m, i) => (m == null ? null : m + k * (width[i] as number))),
    lower: middle.map((m, i) => (m == null ? null : m - k * (width[i] as number))),
  };
}

export interface ChannelResult {
  readonly upper: Series;
  readonly lower: Series;
}

/**
 * Price channel: the highest high and lowest low of the `period` candles
 * before each one. The current candle is left out, so a close above the upper
 * line is a close beyond the earlier range (spec §15.2 channel breakouts).
 */
export function priceChannel(candles: readonly { readonly high: number; readonly low: number }[], period = 20): ChannelResult {
  check(period);
  const upper = candles.map((_c, i) => (i < period ? null : Math.max(...candles.slice(i - period, i).map((c) => c.high))));
  const lower = candles.map((_c, i) => (i < period ? null : Math.min(...candles.slice(i - period, i).map((c) => c.low))));
  return { upper, lower };
}
