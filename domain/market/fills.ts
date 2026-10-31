import { dec, type Decimal } from '../../shared/decimal';
import type { Candle } from '../models/markets';

/**
 * Execution conventions shared by replay, paper trading and backtests
 * (spec §16.3). One implementation, so all three apply identical rules:
 * - Candles show the mid price. Buys trade on the ask (mid + half spread),
 *   sells on the bid (mid − half spread).
 * - Market orders fill at the candle's open, with slippage.
 * - Limit orders and take profits fill only when price trades through their
 *   level (`limitRule: 'through'`, the default; `'touch'` also fills when
 *   price only reaches it). They fill at their own price, never better, even
 *   when the candle gaps past it, and never with slippage.
 * - Stop orders and stop losses trigger when price reaches the level. They
 *   fill at the level, or at the open when the candle gaps past it (worse
 *   than the stop), plus slippage.
 * - When one candle reaches both the stop and the target, the stop is assumed
 *   to have filled first (OHLC data does not show which came first).
 * - On the candle where an order filled inside the bar, only the stop is
 *   checked, at its exact level: the rest of that candle may have happened
 *   before the entry.
 * Replay passes `NO_COSTS`; paper trading and backtests pass the instrument's.
 */

export type FillSide = 'buy' | 'sell';
export type FillOrderType = 'market' | 'limit' | 'stop';

/** When a limit order or take profit fills: only once price trades beyond it, or as soon as price reaches it. */
export type LimitRule = 'through' | 'touch';
export const DEFAULT_LIMIT_RULE: LimitRule = 'through';

export interface FillCosts {
  /** Half the bid–ask spread, in price units. */
  readonly halfSpread: Decimal;
  /** Extra price paid on market and stop fills. */
  readonly slippage: Decimal;
  readonly limitRule: LimitRule;
}

export const NO_COSTS: FillCosts = { halfSpread: dec(0), slippage: dec(0), limitRule: DEFAULT_LIMIT_RULE };

/** True when a limit-type level at `level` is reached by `extreme` (a low for buys, a high for sells). */
function limitReached(rule: LimitRule, buy: boolean, extreme: Decimal, level: Decimal): boolean {
  if (rule === 'touch') return buy ? extreme.lte(level) : extreme.gte(level);
  return buy ? extreme.lt(level) : extreme.gt(level);
}

export type FillExitReason = 'stop_loss' | 'take_profit';

export interface CandleExit {
  readonly price: Decimal;
  readonly reason: FillExitReason;
}

const minOf = (a: Decimal, b: Decimal): Decimal => (a.lt(b) ? a : b);
const maxOf = (a: Decimal, b: Decimal): Decimal => (a.gt(b) ? a : b);

/** Price paid to open at mid price `mid` (buy at the ask, sell at the bid), with slippage when `slip`. */
export function openPrice(costs: FillCosts, side: FillSide, mid: Decimal, slip: boolean): Decimal {
  const away = costs.halfSpread.plus(slip ? costs.slippage : dec(0));
  return side === 'buy' ? mid.plus(away) : mid.minus(away);
}

/** Price received to close a position of `side` at mid price `mid` (a buy closes at the bid), with slippage when `slip`. */
export function closePrice(costs: FillCosts, side: FillSide, mid: Decimal, slip: boolean): Decimal {
  const away = costs.halfSpread.plus(slip ? costs.slippage : dec(0));
  return side === 'buy' ? mid.minus(away) : mid.plus(away);
}

/** Fill price of an order on this candle, or null if its price was not reached. */
export function orderFillPrice(costs: FillCosts, side: FillSide, type: FillOrderType, price: Decimal | null, c: Candle): Decimal | null {
  if (type === 'market' || !price) return openPrice(costs, side, c.open, true);
  const h = costs.halfSpread;
  const buy = side === 'buy';
  const open = buy ? c.open.plus(h) : c.open.minus(h);
  const high = buy ? c.high.plus(h) : c.high.minus(h);
  const low = buy ? c.low.plus(h) : c.low.minus(h);
  // A limit fills at its own price, never better, even when the candle gaps past it.
  if (type === 'limit') return limitReached(costs.limitRule, buy, buy ? low : high, price) ? price : null;
  if (buy) return high.gte(price) ? maxOf(open, price).plus(costs.slippage) : null;
  return low.lte(price) ? minOf(open, price).minus(costs.slippage) : null;
}

/** True when a pending order filled inside the candle rather than at its open (a gap past a limit counts as at the open). */
export function filledInsideCandle(costs: FillCosts, side: FillSide, type: FillOrderType, fill: Decimal, c: Candle): boolean {
  if (type === 'market') return false;
  const open = side === 'buy' ? c.open.plus(costs.halfSpread) : c.open.minus(costs.halfSpread);
  if (type === 'limit') return !limitReached(costs.limitRule, side === 'buy', open, fill);
  return !fill.eq(openPrice(costs, side, c.open, true));
}

/** Stop loss or take profit reached on this candle; the stop wins ties. A buy closes on the bid, a sell on the ask. */
export function exitOnCandle(
  costs: FillCosts,
  side: FillSide,
  stopLoss: Decimal | null,
  takeProfit: Decimal | null,
  c: Candle,
  intrabarEntry: boolean,
): CandleExit | null {
  const h = costs.halfSpread;
  const buy = side === 'buy';
  const open = buy ? c.open.minus(h) : c.open.plus(h);
  const high = buy ? c.high.minus(h) : c.high.plus(h);
  const low = buy ? c.low.minus(h) : c.low.plus(h);
  if (stopLoss && (buy ? low.lte(stopLoss) : high.gte(stopLoss))) {
    const level = intrabarEntry ? stopLoss : buy ? minOf(open, stopLoss) : maxOf(open, stopLoss);
    return { price: buy ? level.minus(costs.slippage) : level.plus(costs.slippage), reason: 'stop_loss' };
  }
  if (intrabarEntry) return null;
  // A take profit is a limit: it fills at its own price, never better, even on a gap.
  if (takeProfit && limitReached(costs.limitRule, !buy, buy ? high : low, takeProfit)) return { price: takeProfit, reason: 'take_profit' };
  return null;
}
