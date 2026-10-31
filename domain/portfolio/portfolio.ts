import { sum, type Decimal } from '../../shared/decimal';
import type { MarketKind } from '../../shared/types';
import type { Candle } from '../models/markets';
import type { PracticeInstrument } from '../simulation/instruments';
import { currentMid, equityOf, type PaperState } from '../simulation/paper';

/**
 * Portfolio view across paper accounts (spec §18). Every account is a
 * separate simulated practice account, so totals are a sum of simulations,
 * not a real portfolio. Exposure is the market value of open positions at
 * the current simulated price.
 */

export interface PortfolioAccountInput {
  readonly id: string;
  readonly name: string;
  readonly instrument: PracticeInstrument;
  readonly state: PaperState;
  readonly candles: readonly Candle[];
}

export interface MarketExposure {
  readonly market: MarketKind;
  readonly positions: number;
  /** Market value of open positions, USD. */
  readonly exposure: number;
  /** Share of all open exposure, 0–1. */
  readonly share: number;
}

export interface AccountRow {
  readonly id: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly equity: number;
  readonly openPositions: number;
  readonly exposure: number;
  /** Largest fall from a peak so far, percent. */
  readonly maxDrawdown: number;
}

export interface Correlation {
  readonly a: string;
  readonly b: string;
  /** Pearson correlation of candle-to-candle returns at the same candle times, −1 to 1. */
  readonly value: number;
  readonly candles: number;
}

export interface PortfolioSummary {
  readonly accounts: readonly AccountRow[];
  readonly totalEquity: number;
  readonly totalExposure: number;
  /** Open exposure ÷ total equity. */
  readonly exposureToEquity: number | null;
  readonly byMarket: readonly MarketExposure[];
  /** The largest market's share of open exposure, 0–1; null with nothing open. */
  readonly concentration: number | null;
  readonly worstDrawdown: number | null;
  readonly correlations: readonly Correlation[];
  /** Why no correlation could be worked out, when none could. */
  readonly correlationNote: string | null;
}

/** Fewer aligned returns than this and a correlation is not shown. */
export const MIN_CORRELATION_CANDLES = 30;

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

function exposureOf(i: PracticeInstrument, s: PaperState, mid: Decimal): Decimal {
  return sum(s.positions.map((p) => mid.times(p.size).times(i.contractSize)));
}

/** Pearson correlation, or null when either series does not move. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let k = 0; k < n; k += 1) {
    const dx = (xs[k] as number) - mx;
    const dy = (ys[k] as number) - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null;
}

/** Candle-to-candle returns of the revealed candles (never the unrevealed future), keyed by the candle's time. */
function revealedReturns(a: PortfolioAccountInput): Map<string, number> {
  const shown = a.candles.slice(0, a.state.cursor + 1);
  const out = new Map<string, number>();
  for (let k = 1; k < shown.length; k += 1) {
    const prev = (shown[k - 1] as Candle).close.toNumber();
    if (prev > 0) out.set((shown[k] as Candle).time, (shown[k] as Candle).close.toNumber() / prev - 1);
  }
  return out;
}

/** Returns of two accounts on the candle times both have, in time order. */
export function alignedReturns(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): { xs: number[]; ys: number[] } {
  const times = [...a.keys()].filter((t) => b.has(t) && Number.isFinite(Date.parse(t))).sort((x, y) => Date.parse(x) - Date.parse(y));
  return { xs: times.map((t) => a.get(t) as number), ys: times.map((t) => b.get(t) as number) };
}

export function portfolioSummary(accounts: readonly PortfolioAccountInput[]): PortfolioSummary {
  const rows: AccountRow[] = accounts.map((a) => {
    const mid = currentMid(a.state, a.candles);
    return {
      id: a.id,
      name: a.name,
      market: a.instrument.market,
      equity: round(equityOf(a.instrument, a.state, mid).toNumber()),
      openPositions: a.state.positions.length,
      exposure: round(exposureOf(a.instrument, a.state, mid).toNumber()),
      maxDrawdown: round(a.state.maxDrawdown.times(100).toNumber()),
    };
  });
  const totalEquity = round(rows.reduce((t, r) => t + r.equity, 0));
  const totalExposure = round(rows.reduce((t, r) => t + r.exposure, 0));
  const markets = [...new Set(rows.map((r) => r.market))];
  const byMarket = markets
    .map((market) => {
      const these = rows.filter((r) => r.market === market);
      const exposure = round(these.reduce((t, r) => t + r.exposure, 0));
      return { market, positions: these.reduce((t, r) => t + r.openPositions, 0), exposure, share: totalExposure > 0 ? exposure / totalExposure : 0 };
    })
    .sort((x, y) => y.exposure - x.exposure);
  const correlations: Correlation[] = [];
  for (let x = 0; x < accounts.length; x += 1) {
    for (let y = x + 1; y < accounts.length; y += 1) {
      const a = accounts[x] as PortfolioAccountInput;
      const b = accounts[y] as PortfolioAccountInput;
      // Only candles at the same time are paired, so accounts on different timeframes or dates are never matched up wrongly.
      const { xs, ys } = alignedReturns(revealedReturns(a), revealedReturns(b));
      if (xs.length < MIN_CORRELATION_CANDLES) continue;
      const value = pearson(xs, ys);
      if (value !== null) correlations.push({ a: a.name, b: b.name, value: round(value), candles: xs.length });
    }
  }
  const correlationNote =
    correlations.length > 0
      ? null
      : accounts.length < 2
        ? 'Not enough data: correlation needs at least two paper accounts.'
        : `Not enough data: each pair of accounts needs at least ${MIN_CORRELATION_CANDLES} revealed candles at the same times.`;
  return {
    accounts: rows,
    totalEquity,
    totalExposure,
    exposureToEquity: totalEquity > 0 ? round(totalExposure / totalEquity, 3) : null,
    byMarket,
    concentration: totalExposure > 0 ? (byMarket[0]?.share ?? null) : null,
    worstDrawdown: rows.length ? Math.max(...rows.map((r) => r.maxDrawdown)) : null,
    correlations,
    correlationNote,
  };
}
