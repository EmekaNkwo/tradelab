import { sum, type Decimal } from '../../shared/decimal';
import { REGIMES, type Regime } from './dataset';
import type { BacktestTrade } from './engine';

/**
 * Backtest metrics (spec §16.3). Money is worked out in Decimal and reported
 * as numbers rounded to cents; ratios are plain numbers. Anything that cannot
 * be worked out (a profit factor with no losing trades, say) is null rather
 * than a misleading figure.
 */

export interface TradeStats {
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  /** 0–1, or null with no trades. */
  readonly winRate: number | null;
  readonly averageWin: number | null;
  readonly averageLoss: number | null;
  /** Average result per trade in money. */
  readonly expectancy: number | null;
  /** Average result per trade in R (multiples of the planned risk). */
  readonly expectancyR: number | null;
  /** Gross wins ÷ gross losses; null without a loss. */
  readonly profitFactor: number | null;
  readonly net: number;
}

export interface BacktestMetrics extends TradeStats {
  readonly startingCapital: number;
  readonly finalEquity: number;
  /** Percent. */
  readonly netReturn: number;
  readonly largestGain: number | null;
  readonly largestLoss: number | null;
  /** Percent of the peak. */
  readonly maxDrawdown: number;
  /** Average drawdown over the candles spent below a peak, percent. */
  readonly averageDrawdown: number;
  /** Percent of candles with a trade open. */
  readonly exposure: number;
  /** Value traded (entry notional) ÷ starting capital. */
  readonly turnover: number;
  readonly averageHoldingCandles: number | null;
  /** Commission and swap paid (positive is a cost). Spread and slippage are in the fill prices. */
  readonly commissionAndSwap: number;
}

export interface RegimeRow extends TradeStats {
  readonly regime: Regime;
}

const money = (d: Decimal) => d.toDecimalPlaces(2).toNumber();
const avg = (xs: readonly Decimal[]): Decimal | null => (xs.length ? sum(xs).div(xs.length) : null);

export function tradeStats(trades: readonly BacktestTrade[]): TradeStats {
  const wins = trades.filter((t) => t.net.gt(0));
  const losses = trades.filter((t) => t.net.lt(0));
  const grossWin = sum(wins.map((t) => t.net));
  const grossLoss = sum(losses.map((t) => t.net)).abs();
  const expectancy = avg(trades.map((t) => t.net));
  const expectancyR = avg(trades.map((t) => t.r));
  const aw = avg(wins.map((t) => t.net));
  const al = avg(losses.map((t) => t.net));
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : null,
    averageWin: aw ? money(aw) : null,
    averageLoss: al ? money(al) : null,
    expectancy: expectancy ? money(expectancy) : null,
    expectancyR: expectancyR ? expectancyR.toDecimalPlaces(3).toNumber() : null,
    profitFactor: grossLoss.gt(0) ? grossWin.div(grossLoss).toDecimalPlaces(3).toNumber() : null,
    net: money(sum(trades.map((t) => t.net))),
  };
}

/** Running fall from the highest equity so far, as a percent, for every point. */
export function drawdownSeries(equity: readonly number[]): readonly number[] {
  let peak = -Infinity;
  return equity.map((e) => {
    peak = Math.max(peak, e);
    return peak > 0 ? ((peak - e) / peak) * 100 : 0;
  });
}

export function backtestMetrics(trades: readonly BacktestTrade[], equity: readonly number[], capital: Decimal, candlesInMarket: number): BacktestMetrics {
  const stats = tradeStats(trades);
  const dd = drawdownSeries(equity);
  const under = dd.filter((x) => x > 0);
  const nets = trades.map((t) => t.net);
  const final = equity[equity.length - 1] ?? capital.toNumber();
  const candles = Math.max(1, equity.length - 1);
  return {
    ...stats,
    startingCapital: money(capital),
    finalEquity: Math.round(final * 100) / 100,
    netReturn: Math.round(((final - capital.toNumber()) / capital.toNumber()) * 10000) / 100,
    largestGain: nets.some((n) => n.gt(0)) ? money(nets.reduce((a, b) => (b.gt(a) ? b : a))) : null,
    largestLoss: nets.some((n) => n.lt(0)) ? money(nets.reduce((a, b) => (b.lt(a) ? b : a))) : null,
    maxDrawdown: Math.round(Math.max(0, ...dd) * 100) / 100,
    averageDrawdown: under.length ? Math.round((under.reduce((a, b) => a + b, 0) / under.length) * 100) / 100 : 0,
    exposure: Math.round((candlesInMarket / candles) * 10000) / 100,
    turnover: Math.round(sum(trades.map((t) => t.notional)).div(capital).toNumber() * 100) / 100,
    averageHoldingCandles: trades.length ? Math.round((trades.reduce((a, t) => a + (t.exitIndex - t.entryIndex), 0) / trades.length) * 10) / 10 : null,
    commissionAndSwap: money(sum(trades.map((t) => t.costs)).negated()),
  };
}

/** Results split by the market regime the trade was entered in. */
export function regimeRows(trades: readonly BacktestTrade[]): readonly RegimeRow[] {
  return REGIMES.map((regime) => ({ regime, ...tradeStats(trades.filter((t) => t.regime === regime)) }));
}

/** At most `points` values: the last equity in each bucket. */
export function downsampleLast(values: readonly number[], points: number): readonly number[] {
  if (values.length <= points) return values;
  const size = values.length / points;
  return Array.from({ length: points }, (_v, b) => values[Math.min(values.length - 1, Math.floor((b + 1) * size) - 1)] as number);
}

/** At most `points` values: the deepest drawdown in each bucket, so the worst fall always shows. */
export function downsampleMax(values: readonly number[], points: number): readonly number[] {
  if (values.length <= points) return values;
  const size = values.length / points;
  return Array.from({ length: points }, (_v, b) => Math.max(...values.slice(Math.floor(b * size), Math.max(Math.floor(b * size) + 1, Math.floor((b + 1) * size)))));
}
