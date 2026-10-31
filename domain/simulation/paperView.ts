import { dec, type Decimal } from '../../shared/decimal';
import type { Candle } from '../models/markets';
import type { PracticeInstrument } from './instruments';
import { currentMid, equityOf, marginUsed, openProfit, type PaperOrder, type PaperPosition, type PaperState, type PaperTrade } from './paper';
import { entryAt, exitAt, grossProfit, marginFor } from './pricing';

/** Everything a paper trading screen may show. Built from the state; never includes unrevealed candles. */
export interface PaperView {
  readonly candles: readonly Candle[];
  readonly remaining: number;
  readonly finished: boolean;
  readonly mid: Decimal;
  readonly bid: Decimal;
  readonly ask: Decimal;
  readonly startingBalance: Decimal;
  readonly balance: Decimal;
  readonly equity: Decimal;
  readonly realised: Decimal;
  readonly unrealised: Decimal;
  readonly marginUsed: Decimal;
  readonly freeMargin: Decimal;
  /** Equity ÷ margin in use; null with nothing open. */
  readonly marginLevel: Decimal | null;
  /** Fall from the highest equity so far, as a fraction. */
  readonly drawdown: Decimal;
  readonly maxDrawdown: Decimal;
  /** Total planned loss if every open stop filled at its level; null if any position has no stop. */
  readonly riskAtStops: Decimal | null;
  /** Value of all open positions at the current price. */
  readonly exposure: Decimal;
  readonly positions: readonly (PaperPosition & { readonly profit: Decimal; readonly margin: Decimal })[];
  readonly orders: readonly PaperOrder[];
  readonly history: readonly PaperTrade[];
  readonly costsPaid: Decimal;
  readonly dayStartBalance: Decimal;
  readonly events: readonly string[];
}

export function paperView(s: PaperState, i: PracticeInstrument, candles: readonly Candle[]): PaperView {
  const mid = currentMid(s, candles);
  const equity = equityOf(i, s, mid);
  const used = marginUsed(i, s.positions, mid);
  const peak = equity.gt(s.peakEquity) ? equity : s.peakEquity;
  // Loss if each stop filled at its level: price move, costs carried so far, and the exit commission.
  const stops = s.positions.map((p) =>
    p.stopLoss ? grossProfit(i, p.side, p.size, p.entry, p.stopLoss).negated().minus(p.carried).plus(i.commissionPerSide.times(p.size)) : null,
  );
  return {
    candles: candles.slice(0, s.cursor + 1),
    remaining: candles.length - 1 - s.cursor,
    finished: s.cursor >= candles.length - 1,
    mid,
    bid: exitAt(i, 'buy', mid, false),
    ask: entryAt(i, 'buy', mid, false),
    startingBalance: s.startingBalance,
    balance: s.balance,
    equity,
    realised: s.balance.minus(s.startingBalance),
    unrealised: equity.minus(s.balance),
    marginUsed: used,
    freeMargin: equity.minus(used),
    marginLevel: used.gt(0) ? equity.div(used) : null,
    drawdown: peak.gt(0) ? peak.minus(equity).div(peak) : dec(0),
    maxDrawdown: s.maxDrawdown,
    riskAtStops: stops.every((x): x is Decimal => x !== null) ? stops.reduce((a, b) => a.plus(b), dec(0)) : null,
    exposure: s.positions.reduce((sum, p) => sum.plus(mid.times(p.size).times(i.contractSize)), dec(0)),
    positions: s.positions.map((p) => ({ ...p, profit: openProfit(i, p, mid), margin: marginFor(i, p.size, i.margin.kind === 'cash' ? p.entry : mid) })),
    orders: s.orders,
    history: s.history,
    costsPaid: s.history.reduce((sum, t) => sum.minus(t.costs), dec(0)),
    dayStartBalance: s.dayStartBalance,
    events: s.events,
  };
}

/** One closed position: its partial closes summed, in the order the position finished. */
export interface ClosedPosition {
  readonly positionId: number;
  readonly net: Decimal;
  readonly plannedRisk: Decimal | null;
}

/** Groups partial closes, so one position counts as one trade. Planned risk is summed back to the whole. */
export function closedPositions(history: readonly PaperTrade[]): readonly ClosedPosition[] {
  const byId = new Map<number, ClosedPosition>();
  for (const t of history) {
    const prev = byId.get(t.positionId);
    byId.delete(t.positionId); // re-insert so the order follows the last close
    byId.set(t.positionId, {
      positionId: t.positionId,
      net: (prev?.net ?? dec(0)).plus(t.net),
      plannedRisk: prev ? (prev.plannedRisk && t.plannedRisk ? prev.plannedRisk.plus(t.plannedRisk) : null) : t.plannedRisk,
    });
  }
  return [...byId.values()];
}

/** Losing positions in a row at the end of the history (partial closes of one position count once). */
export function consecutiveLosses(history: readonly PaperTrade[]): number {
  const positions = closedPositions(history);
  let n = 0;
  for (let k = positions.length - 1; k >= 0 && (positions[k] as ClosedPosition).net.isNegative(); k -= 1) n += 1;
  return n;
}
