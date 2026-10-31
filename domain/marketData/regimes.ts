import type { Regime } from '../backtest/dataset';
import type { Candle } from '../models/markets';

/**
 * Market conditions for real data, estimated with hindsight from a window
 * around each candle (a trend's efficiency and the range relative to the
 * typical range). Used only to break results down by condition after a run,
 * never by a strategy, and labelled as an estimate wherever it is shown.
 */
export const REGIME_WINDOW = 50;
const TREND_EFFICIENCY = 0.3;
const VOLATILE_FACTOR = 1.6;

export function estimateRegimes(candles: readonly Candle[], window = REGIME_WINDOW): readonly Regime[] {
  const n = candles.length;
  if (n === 0) return [];
  const closes = candles.map((c) => c.close.toNumber());
  const ranges = candles.map((c) => (c.high.toNumber() - c.low.toNumber()) / Math.max(c.close.toNumber(), Number.EPSILON));
  const sortedRanges = [...ranges].sort((a, b) => a - b);
  const typical = sortedRanges[Math.floor(sortedRanges.length / 2)] ?? 0;
  const half = Math.floor(window / 2);
  return candles.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(n - 1, i + half);
    let path = 0;
    let rangeSum = 0;
    for (let k = from + 1; k <= to; k += 1) path += Math.abs((closes[k] as number) - (closes[k - 1] as number));
    for (let k = from; k <= to; k += 1) rangeSum += ranges[k] as number;
    const avgRange = rangeSum / (to - from + 1);
    if (typical > 0 && avgRange > typical * VOLATILE_FACTOR) return 'volatile';
    const net = (closes[to] as number) - (closes[from] as number);
    const efficiency = path > 0 ? Math.abs(net) / path : 0;
    if (efficiency >= TREND_EFFICIENCY) return net > 0 ? 'trending_up' : 'trending_down';
    return 'ranging';
  });
}
