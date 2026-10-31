import { dec, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { ExitReason, OrderType, Side } from '../market/replay';
import type { Candle } from '../models/markets';
import type { RuleId } from '../risk/rules';
import type { PracticeInstrument } from './instruments';
import { filledInsideCandle } from '../market/fills';
import { exitAt, exitOn, fillCosts, grossProfit, marginFor, orderFill } from './pricing';

/**
 * Paper trading account (spec §17). A pure state machine over a candle
 * series the caller supplies; `cursor` is the last revealed candle, and the
 * view never includes later ones. Several positions may be open at once.
 * Costs: spread and slippage are in the fill prices; commission is charged
 * per side; swap is added each time a new day starts while a position is
 * open. Balance changes only when a trade closes; equity includes open
 * positions. See `pricing.ts` for the fill rules.
 */

export type PaperExitReason = ExitReason | 'stop_out';

export interface PaperOrderRequest {
  readonly side: Side;
  readonly type: OrderType;
  readonly size: Decimal;
  /** Required for limit and stop orders. */
  readonly price: Decimal | null;
  readonly stopLoss: Decimal | null;
  readonly takeProfit: Decimal | null;
  /** Rules the learner was shown and chose to break; kept with the trade for the journal. */
  readonly violations: readonly RuleId[];
  /** Planned loss at the stop and equity when the order was placed, kept for the journal. */
  readonly plannedRisk: Decimal | null;
  readonly equityAtOrder: Decimal;
}

export interface PaperOrder extends PaperOrderRequest {
  readonly id: number;
  readonly placedAt: number;
}

export interface PaperPosition {
  readonly id: number;
  readonly side: Side;
  readonly size: Decimal;
  readonly entry: Decimal;
  readonly openedAt: number;
  readonly stopLoss: Decimal | null;
  readonly takeProfit: Decimal | null;
  readonly initialStop: Decimal | null;
  /** Costs carried so far (entry commission, swap); negative is a cost. */
  readonly carried: Decimal;
  readonly violations: readonly RuleId[];
  readonly plannedRisk: Decimal | null;
  readonly equityAtOrder: Decimal;
}

export interface PaperTrade {
  readonly positionId: number;
  readonly side: Side;
  readonly size: Decimal;
  readonly entry: Decimal;
  readonly exit: Decimal;
  readonly openedAt: number;
  readonly closedAt: number;
  readonly reason: PaperExitReason;
  readonly gross: Decimal;
  /** Commission and swap for this part of the position; negative is a cost. */
  readonly costs: Decimal;
  readonly net: Decimal;
  readonly initialStop: Decimal | null;
  readonly violations: readonly RuleId[];
  readonly plannedRisk: Decimal | null;
  readonly equityAtOrder: Decimal;
}

export interface PaperState {
  readonly instrumentId: string;
  readonly cursor: number;
  readonly startingBalance: Decimal;
  readonly balance: Decimal;
  readonly positions: readonly PaperPosition[];
  readonly orders: readonly PaperOrder[];
  readonly history: readonly PaperTrade[];
  readonly nextId: number;
  readonly peakEquity: Decimal;
  /** Largest fall from a peak so far, as a fraction (0.1 = 10%). */
  readonly maxDrawdown: Decimal;
  /** UTC date of the current simulated day, and the balance when it started. */
  readonly day: string;
  readonly dayStartBalance: Decimal;
  /** What happened on the last step, for screen-reader announcements. */
  readonly events: readonly string[];
}

const dayOf = (c: Candle): string => c.time.slice(0, 10);
const candleAt = (candles: readonly Candle[], i: number): Candle => {
  const c = candles[i];
  if (!c) throw new Error(`No candle at ${i}`);
  return c;
};

export function startPaper(i: PracticeInstrument, candles: readonly Candle[], startIndex: number, balance: Decimal): Result<PaperState, AppError> {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= candles.length - 1) {
    return err(validationError('Paper trading needs at least one candle still to come'));
  }
  if (balance.lte(0)) return err(validationError('Starting balance must be more than zero'));
  return ok({
    instrumentId: i.id,
    cursor: startIndex,
    startingBalance: balance,
    balance,
    positions: [],
    orders: [],
    history: [],
    nextId: 1,
    peakEquity: balance,
    maxDrawdown: dec(0),
    day: dayOf(candleAt(candles, startIndex)),
    dayStartBalance: balance,
    events: [],
  });
}

export const currentMid = (s: PaperState, candles: readonly Candle[]): Decimal => candleAt(candles, s.cursor).close;

/** Open profit of a position at mid price `mid`, including costs carried so far. */
export function openProfit(i: PracticeInstrument, p: PaperPosition, mid: Decimal): Decimal {
  return grossProfit(i, p.side, p.size, p.entry, exitAt(i, p.side, mid, false)).plus(p.carried);
}

export function equityOf(i: PracticeInstrument, s: PaperState, mid: Decimal): Decimal {
  return s.positions.reduce((sum, p) => sum.plus(openProfit(i, p, mid)), s.balance);
}

export function marginUsed(i: PracticeInstrument, positions: readonly PaperPosition[], mid: Decimal): Decimal {
  // Cash accounts lock what was paid; leveraged ones the margin at today's price.
  return positions.reduce((sum, p) => sum.plus(marginFor(i, p.size, i.margin.kind === 'cash' ? p.entry : mid)), dec(0));
}

function checkSize(i: PracticeInstrument, size: Decimal): AppError | null {
  if (!size.isFinite() || size.lt(i.minSize)) return validationError(`The smallest size is ${i.minSize.toString()} ${i.sizeUnit}`);
  if (!size.mod(i.sizeStep).eq(0)) return validationError(`Size goes in steps of ${i.sizeStep.toString()} ${i.sizeUnit}`);
  if (i.maxOrderSize && size.gt(i.maxOrderSize)) {
    return validationError(`This market is thin: one order can fill at most ${i.maxOrderSize.toString()} ${i.sizeUnit}`);
  }
  return null;
}

/** Stop below and target above the reference for a buy; the other way round for a sell. */
export function checkLevels(side: Side, reference: Decimal, stopLoss: Decimal | null, takeProfit: Decimal | null): AppError | null {
  const buy = side === 'buy';
  if (stopLoss && (stopLoss.lte(0) || (buy ? stopLoss.gte(reference) : stopLoss.lte(reference)))) {
    return validationError(`For a ${side} the stop loss must be ${buy ? 'below' : 'above'} ${reference.toString()}`);
  }
  if (takeProfit && (takeProfit.lte(0) || (buy ? takeProfit.lte(reference) : takeProfit.gte(reference)))) {
    return validationError(`For a ${side} the take profit must be ${buy ? 'above' : 'below'} ${reference.toString()}`);
  }
  return null;
}

/** Mid price an order is expected to start from: the current price, or its own price. */
export function referencePrice(s: PaperState, candles: readonly Candle[], order: Pick<PaperOrderRequest, 'type' | 'price'>): Decimal {
  return order.type === 'market' || !order.price ? currentMid(s, candles) : order.price;
}

export function placePaperOrder(s: PaperState, i: PracticeInstrument, candles: readonly Candle[], order: PaperOrderRequest): Result<PaperState, AppError> {
  if (s.cursor >= candles.length - 1) return err(validationError('This practice session has ended. Reset the account to continue.'));
  if (order.side === 'sell' && !i.allowShort) return err(validationError('This practice account can only buy this market'));
  const sizeError = checkSize(i, order.size);
  if (sizeError) return err(sizeError);
  const mid = currentMid(s, candles);
  if (order.type !== 'market') {
    if (!order.price || order.price.lte(0)) return err(validationError('Enter the order price'));
    const below = (order.side === 'buy') === (order.type === 'limit');
    if (below ? order.price.gte(mid) : order.price.lte(mid)) {
      return err(validationError(`A ${order.side} ${order.type} goes ${below ? 'below' : 'above'} the current price ${mid.toString()}`));
    }
  }
  const reference = referencePrice(s, candles, order);
  const levelError = checkLevels(order.side, reference, order.stopLoss, order.takeProfit);
  if (levelError) return err(levelError);
  const needed = marginFor(i, order.size, reference).plus(marginUsed(i, s.positions, mid));
  const equity = equityOf(i, s, mid);
  if (needed.gt(equity)) {
    return err(validationError(`Not enough free funds: this needs ${needed.toFixed(2)} in margin or cash, and equity is ${equity.toFixed(2)}`));
  }
  const placed: PaperOrder = { ...order, price: order.type === 'market' ? null : order.price, id: s.nextId, placedAt: s.cursor };
  return ok({ ...s, orders: [...s.orders, placed], nextId: s.nextId + 1, events: [`${order.side} ${order.type} order placed`] });
}

export function cancelPaperOrder(s: PaperState, orderId: number): Result<PaperState, AppError> {
  if (!s.orders.some((o) => o.id === orderId)) return err(validationError('That order is no longer pending'));
  return ok({ ...s, orders: s.orders.filter((o) => o.id !== orderId), events: ['Order cancelled'] });
}

function closePart(s: PaperState, i: PracticeInstrument, p: PaperPosition, size: Decimal, exit: Decimal, at: number, reason: PaperExitReason): PaperState {
  const share = size.div(p.size);
  const carried = p.carried.times(share);
  const gross = grossProfit(i, p.side, size, p.entry, exit);
  const costs = carried.minus(i.commissionPerSide.times(size));
  const net = gross.plus(costs);
  const trade: PaperTrade = {
    positionId: p.id,
    side: p.side,
    size,
    entry: p.entry,
    exit,
    openedAt: p.openedAt,
    closedAt: at,
    reason,
    gross,
    costs,
    net,
    initialStop: p.initialStop,
    violations: p.violations,
    // A partial close carries its share of the planned risk.
    plannedRisk: p.plannedRisk ? p.plannedRisk.times(share) : null,
    equityAtOrder: p.equityAtOrder,
  };
  const left = p.size.minus(size);
  const positions = left.gt(0)
    ? s.positions.map((q) => (q.id === p.id ? { ...q, size: left, carried: q.carried.minus(carried), plannedRisk: q.plannedRisk ? q.plannedRisk.minus(q.plannedRisk.times(share)) : null } : q))
    : s.positions.filter((q) => q.id !== p.id);
  return { ...s, balance: s.balance.plus(net), positions, history: [...s.history, trade] };
}

/** Closes `size` (all when null) of a position at the current price, as a market order. */
export function closePaperPosition(s: PaperState, i: PracticeInstrument, candles: readonly Candle[], positionId: number, size: Decimal | null): Result<PaperState, AppError> {
  const p = s.positions.find((q) => q.id === positionId);
  if (!p) return err(validationError('That position is already closed'));
  const amount = size ?? p.size;
  if (amount.lte(0) || amount.gt(p.size) || !amount.mod(i.sizeStep).eq(0)) {
    return err(validationError(`Close between ${i.sizeStep.toString()} and ${p.size.toString()} ${i.sizeUnit}, in steps of ${i.sizeStep.toString()}`));
  }
  const left = p.size.minus(amount);
  if (left.gt(0) && left.lt(i.minSize)) return err(validationError(`What is left must be at least ${i.minSize.toString()} ${i.sizeUnit}`));
  const exit = exitAt(i, p.side, currentMid(s, candles), true);
  const next = closePart(s, i, p, amount, exit, s.cursor, 'manual');
  return ok({ ...next, events: [left.gt(0) ? 'Part of the position closed' : 'Position closed'] });
}

export function editPaperPosition(
  s: PaperState,
  i: PracticeInstrument,
  candles: readonly Candle[],
  positionId: number,
  stopLoss: Decimal | null,
  takeProfit: Decimal | null,
): Result<PaperState, AppError> {
  const p = s.positions.find((q) => q.id === positionId);
  if (!p) return err(validationError('That position is already closed'));
  const levelError = checkLevels(p.side, exitAt(i, p.side, currentMid(s, candles), false), stopLoss, takeProfit);
  if (levelError) return err(levelError);
  const widened = stopWidened(p.side, p.stopLoss, stopLoss);
  const violations = widened && !p.violations.includes('stop_moved_away') ? [...p.violations, 'stop_moved_away' as const] : p.violations;
  return ok({
    ...s,
    positions: s.positions.map((q) => (q.id === p.id ? { ...q, stopLoss, takeProfit, violations } : q)),
    events: [widened ? 'Stop moved to risk more: recorded as a rule break' : 'Stop and target updated'],
  });
}

/** True when the new stop risks more than the old one: removed, or moved away from the entry. */
export function stopWidened(side: Side, before: Decimal | null, after: Decimal | null): boolean {
  if (before === null) return false;
  if (after === null) return true;
  return side === 'buy' ? after.lt(before) : after.gt(before);
}

function chargeSwap(s: PaperState, i: PracticeInstrument, c: Candle): PaperState {
  const day = dayOf(c);
  if (day === s.day) return s;
  const positions = s.positions.map((p) => ({ ...p, carried: p.carried.plus((p.side === 'buy' ? i.swapLong : i.swapShort).times(p.size)) }));
  return { ...s, positions, day, dayStartBalance: s.balance };
}

function fillOrders(s: PaperState, i: PracticeInstrument, c: Candle, at: number, events: string[]): { state: PaperState; intrabar: ReadonlySet<number> } {
  let state = s;
  const intrabar = new Set<number>();
  for (const o of s.orders) {
    const fill = orderFill(i, o.side, o.type, o.price, c);
    if (!fill) continue;
    state = { ...state, orders: state.orders.filter((q) => q.id !== o.id) };
    const needed = marginFor(i, o.size, fill).plus(marginUsed(i, state.positions, c.open));
    if (needed.gt(equityOf(i, state, c.open))) {
      events.push(`Order ${o.id} cancelled: not enough free funds when it was reached`);
      continue;
    }
    const position: PaperPosition = {
      id: o.id,
      side: o.side,
      size: o.size,
      entry: fill,
      openedAt: at,
      stopLoss: o.stopLoss,
      takeProfit: o.takeProfit,
      initialStop: o.stopLoss,
      carried: i.commissionPerSide.times(o.size).negated(),
      violations: o.violations,
      plannedRisk: o.plannedRisk,
      equityAtOrder: o.equityAtOrder,
    };
    if (filledInsideCandle(fillCosts(i), o.side, o.type, fill, c)) intrabar.add(o.id);
    state = { ...state, positions: [...state.positions, position] };
    events.push(`${o.side === 'buy' ? 'Bought' : 'Sold'} ${o.size.toString()} at ${fill.toString()}`);
  }
  return { state, intrabar };
}

/**
 * Closes a whole position at the next candle's open, as a market order: how a
 * rule-based exit signalled on a close is filled (backtests, spec §16.3).
 * Call before `advancePaper` reveals that candle. A new day's swap is charged
 * first, because the day change comes before the open's fill.
 */
export function closePaperPositionAtNextOpen(s: PaperState, i: PracticeInstrument, candles: readonly Candle[], positionId: number): Result<PaperState, AppError> {
  const next = candles[s.cursor + 1];
  if (!next) return err(validationError('There is no next candle to close on'));
  const charged = chargeSwap(s, i, next);
  const p = charged.positions.find((q) => q.id === positionId);
  if (!p) return err(validationError('That position is already closed'));
  return ok(closePart(charged, i, p, p.size, exitAt(i, p.side, next.open, true), s.cursor + 1, 'manual'));
}

function closeAll(s: PaperState, i: PracticeInstrument, mid: Decimal, at: number, reason: PaperExitReason): PaperState {
  return s.positions.reduce((acc, p) => closePart(acc, i, p, p.size, exitAt(i, p.side, mid, true), at, reason), s);
}

/** Reveals the next candle: swap at a new day, order fills, stops and targets, stop out, and end of data. */
export function advancePaper(s: PaperState, i: PracticeInstrument, candles: readonly Candle[]): PaperState {
  const at = s.cursor + 1;
  const c = candles[at];
  if (!c) return s;
  const events: string[] = [];
  const filled = fillOrders(chargeSwap({ ...s, cursor: at }, i, c), i, c, at, events);
  let state = filled.state;
  for (const p of state.positions) {
    const exit = exitOn(i, p.side, p.stopLoss, p.takeProfit, c, filled.intrabar.has(p.id));
    if (exit) {
      state = closePart(state, i, p, p.size, exit.price, at, exit.reason);
      events.push(`Position ${p.id} closed at its ${exit.reason === 'stop_loss' ? 'stop loss' : 'take profit'}`);
    }
  }
  const used = marginUsed(i, state.positions, c.close);
  if (i.stopOutLevel && used.gt(0) && equityOf(i, state, c.close).lt(used.times(i.stopOutLevel))) {
    state = closeAll(state, i, c.close, at, 'stop_out');
    events.push('Stop out: equity fell below the required margin, so all positions were closed');
  }
  if (at === candles.length - 1) {
    if (state.positions.length > 0) events.push('The session ended, so open positions were closed');
    state = { ...closeAll(state, i, c.close, at, 'end_of_data'), orders: [] };
  }
  const equity = equityOf(i, state, c.close);
  const peak = equity.gt(state.peakEquity) ? equity : state.peakEquity;
  const drawdown = peak.gt(0) ? peak.minus(equity).div(peak) : dec(0);
  return { ...state, peakEquity: peak, maxDrawdown: drawdown.gt(state.maxDrawdown) ? drawdown : state.maxDrawdown, events };
}
