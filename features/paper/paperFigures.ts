import type { PaperTrade, PaperView } from '../../domain/simulation';
import type { Decimal } from '../../shared/decimal';

/**
 * Pure view-model for the paper account screens (restyle brief §5.3). Every figure is the paper engine's own
 * number from `PaperView`, only formatted here; R multiples are derived from a trade's own planned risk.
 */

const MINUS = '−';

/** "10,430.25": two decimals with thousands separators, from the Decimal's own digits (no float rounding). */
export function groupedFixed(d: Decimal): string {
  const [int = '0', frac = '00'] = d.abs().toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

/** "10,430.25 USD", or "−12.40 USD" below zero. */
export function moneyText(d: Decimal): string {
  const sign = d.isNegative() && groupedFixed(d) !== '0.00' ? MINUS : '';
  return `${sign}${groupedFixed(d)} USD`;
}

/** For screen readers: "minus 12.40 USD" rather than a minus sign TalkBack may skip. */
export function spokenMoney(d: Decimal): string {
  const text = moneyText(d);
  return text.startsWith(MINUS) ? `minus ${text.slice(MINUS.length)}` : text;
}

/**
 * A trade's commission and swap: `costs` is negative when the trade paid them and positive when a swap credit
 * outweighed them, so a credit is never called a cost.
 */
export function costsText(costs: Decimal): string {
  if (groupedFixed(costs) === '0.00') return 'no costs';
  return costs.isNegative() ? `costs ${moneyMagnitude(costs)}` : `swap credit ${moneyMagnitude(costs)}`;
}

/** Unsigned "12.40 USD", for PnLValue (it adds the sign and the arrow). */
export function moneyMagnitude(d: Decimal): string {
  return `${groupedFixed(d)} USD`;
}

/** The instrument symbol without the "(simulated)" tag, for icons and compact rows: "EUR/USD". */
export function baseSymbol(symbol: string): string {
  return symbol.replace(/\s*\(simulated\)\s*$/i, '').trim();
}

/** Unsigned R multiple of a closed trade ("1.7R"), when it had a planned risk at the stop; null otherwise. */
export function tradeR(t: Pick<PaperTrade, 'net' | 'plannedRisk'>): string | null {
  if (!t.plannedRisk || !t.plannedRisk.gt(0)) return null;
  return `${t.net.div(t.plannedRisk).abs().toFixed(1)}R`;
}

export interface TradeRow {
  /** "Buy EUR/USD · 0.10 lots" */
  readonly title: string;
  /** "1.10250 → 1.10410 · costs 1.40 USD · rule broken" (or "swap credit …", "no costs") */
  readonly subtitle: string;
  readonly net: Decimal;
  readonly amount: string;
  readonly r: string | null;
}

export function tradeRow(t: PaperTrade, symbol: string, sizeUnit: string): TradeRow {
  return {
    title: `${t.side === 'buy' ? 'Buy' : 'Sell'} ${baseSymbol(symbol)} · ${t.size.toString()} ${sizeUnit}`,
    subtitle: `${t.entry.toString()} → ${t.exit.toString()} · ${costsText(t.costs)}${t.violations.length > 0 ? ' · rule broken' : ''}`,
    net: t.net,
    amount: moneyMagnitude(t.net),
    r: tradeR(t),
  };
}

/** Equity against the starting balance, in percent to one decimal, unsigned; null without a starting balance. */
export function equityChange(view: Pick<PaperView, 'equity' | 'startingBalance'>): { readonly delta: number; readonly text: string } | null {
  if (!view.startingBalance.gt(0)) return null;
  const change = view.equity.minus(view.startingBalance).div(view.startingBalance).times(100);
  const shown = change.toFixed(1);
  return { delta: Number(shown), text: `${change.abs().toFixed(1)}%` };
}

/** Risk at the stops: money, "Not defined" when a position has no stop, "0.00 USD" with nothing open. */
export function riskAtStopsText(view: Pick<PaperView, 'riskAtStops' | 'positions'>): string {
  if (view.riskAtStops) return moneyText(view.riskAtStops);
  return view.positions.length > 0 ? 'Not defined' : '0.00 USD';
}
