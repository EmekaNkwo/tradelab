import { dec, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { Candle } from '../models/markets';
import { exitOnCandle, filledInsideCandle, NO_COSTS, orderFillPrice } from './fills';

/**
 * Replay engine (spec §13.2). Candles not yet revealed live in `upcoming`,
 * which never appears in `ReplayView`; screens only ever receive the view, so
 * the future cannot reach the chart early.
 *
 * Simulation rules (kept simple and stated to the learner; the fill rules are
 * the shared conventions in `fills.ts`, with no costs):
 * - One position at a time; orders are in units of the instrument.
 * - A market order fills at the NEXT candle's open (decisions use closed candles only).
 * - Limit orders and take profits fill once a revealed candle trades through
 *   their price, at that price (never better, even on a gap). Stop orders and
 *   stop losses fill at their price, or at the open when the candle gaps past it.
 * - If one candle reaches both the stop loss and the take profit, the stop is
 *   assumed to fill first (we cannot know the order inside a candle).
 * - On the candle where a limit or stop order fills, only the stop loss is
 *   checked, at its exact level: the rest of that candle may have happened
 *   before the entry, so a take profit waits for the next candle.
 * - No spread, commission, or swap is charged in replay.
 */

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';

export interface OrderRequest {
  readonly side: Side;
  readonly type: OrderType;
  readonly units: Decimal;
  /** Required for limit and stop orders. */
  readonly price?: Decimal;
  readonly stopLoss?: Decimal;
  readonly takeProfit?: Decimal;
}

export interface PendingOrder extends OrderRequest {
  readonly id: number;
  readonly placedAt: number;
}

export interface Position {
  readonly side: Side;
  readonly units: Decimal;
  readonly entry: Decimal;
  readonly openedAt: number;
  readonly stopLoss: Decimal | null;
  readonly takeProfit: Decimal | null;
  /** The stop loss when the trade opened; later edits do not change it (used to judge planned risk). */
  readonly initialStop: Decimal | null;
}

export type ExitReason = 'stop_loss' | 'take_profit' | 'manual' | 'end_of_data';

export interface ClosedTrade {
  readonly side: Side;
  readonly units: Decimal;
  readonly entry: Decimal;
  readonly exit: Decimal;
  readonly openedAt: number;
  readonly closedAt: number;
  readonly reason: ExitReason;
  readonly profit: Decimal;
  readonly initialStop: Decimal | null;
}

interface Core {
  readonly visible: readonly Candle[];
  readonly upcoming: readonly Candle[];
  readonly balance: Decimal;
  readonly orders: readonly PendingOrder[];
  readonly position: Position | null;
  readonly closed: readonly ClosedTrade[];
  readonly nextOrderId: number;
}

/**
 * A step-back entry: everything but the candles, which are rebuilt from the
 * series (always `visible` then `upcoming`) and the count that was revealed.
 * Keeping a copy of the revealed candles per step grew as steps × candles.
 */
type Snapshot = Omit<Core, 'visible' | 'upcoming'> & { readonly revealed: number };

export interface ReplayState extends Core {
  readonly past: readonly Snapshot[];
}

/** Everything a screen may see. Deliberately has no access to upcoming candles. */
export interface ReplayView {
  readonly candles: readonly Candle[];
  readonly remaining: number;
  readonly balance: Decimal;
  readonly equity: Decimal;
  readonly orders: readonly PendingOrder[];
  readonly position: Position | null;
  readonly closed: readonly ClosedTrade[];
  readonly canStepBack: boolean;
  readonly finished: boolean;
}

export function startReplay(series: readonly Candle[], revealed: number, balance: Decimal): Result<ReplayState, AppError> {
  if (!Number.isInteger(revealed) || revealed < 1 || revealed >= series.length) {
    return err(validationError('Replay needs at least one revealed and one upcoming candle'));
  }
  if (balance.lte(0)) return err(validationError('Starting balance must be more than zero'));
  return ok({ visible: series.slice(0, revealed), upcoming: series.slice(revealed), balance, orders: [], position: null, closed: [], nextOrderId: 1, past: [] });
}

const lastClose = (s: Core): Decimal => (s.visible[s.visible.length - 1] as Candle).close;
const direction = (side: Side) => (side === 'buy' ? 1 : -1);
const profitOf = (side: Side, units: Decimal, entry: Decimal, exit: Decimal) => exit.minus(entry).times(units).times(direction(side));

export function replayView(state: ReplayState): ReplayView {
  const p = state.position;
  const unrealised = p ? profitOf(p.side, p.units, p.entry, lastClose(state)) : dec(0);
  return {
    candles: state.visible,
    remaining: state.upcoming.length,
    balance: state.balance,
    equity: state.balance.plus(unrealised),
    orders: state.orders,
    position: p,
    closed: state.closed,
    canStepBack: state.past.length > 0,
    finished: state.upcoming.length === 0,
  };
}

function core(s: ReplayState): Core {
  const { past: _past, ...rest } = s;
  return rest;
}

/** Applies an action and remembers the previous state so the learner can step back. */
function commit(prev: ReplayState, next: Core): ReplayState {
  const { visible, upcoming: _upcoming, ...rest } = core(prev);
  return { ...next, past: [...prev.past, { ...rest, revealed: visible.length }] };
}

/** Stop and target must sit on the losing and winning side of the reference price. */
function checkLevels(side: Side, reference: Decimal, stopLoss?: Decimal, takeProfit?: Decimal): AppError | null {
  const buy = side === 'buy';
  if (stopLoss && (buy ? stopLoss.gte(reference) : stopLoss.lte(reference))) {
    return validationError(`For a ${side} the stop loss must be ${buy ? 'below' : 'above'} ${reference.toString()}`);
  }
  if (takeProfit && (buy ? takeProfit.lte(reference) : takeProfit.gte(reference))) {
    return validationError(`For a ${side} the take profit must be ${buy ? 'above' : 'below'} ${reference.toString()}`);
  }
  return null;
}

export function placeOrder(state: ReplayState, order: OrderRequest): Result<ReplayState, AppError> {
  if (state.upcoming.length === 0) return err(validationError('The replay has ended'));
  if (state.position || state.orders.length > 0) return err(validationError('Close the open trade or cancel the pending order first'));
  if (order.units.lte(0)) return err(validationError('Size must be more than zero'));
  if (state.balance.lte(0)) return err(validationError('The simulated balance is used up. Restart the replay to practise again.'));
  const current = lastClose(state);
  let reference = current;
  if (order.type !== 'market') {
    if (!order.price || order.price.lte(0)) return err(validationError('Enter the order price'));
    // Buy limit / sell stop sit below the price; buy stop / sell limit above.
    const below = (order.side === 'buy') === (order.type === 'limit');
    if (below ? order.price.gte(current) : order.price.lte(current)) {
      return err(validationError(`A ${order.side} ${order.type} goes ${below ? 'below' : 'above'} the current price ${current.toString()}`));
    }
    reference = order.price;
  }
  const levelError = checkLevels(order.side, reference, order.stopLoss, order.takeProfit);
  if (levelError) return err(levelError);
  const pending: PendingOrder = { ...order, id: state.nextOrderId, placedAt: state.visible.length - 1 };
  return ok(commit(state, { ...core(state), orders: [pending], nextOrderId: state.nextOrderId + 1 }));
}

export function cancelOrders(state: ReplayState): ReplayState {
  return state.orders.length === 0 ? state : commit(state, { ...core(state), orders: [] });
}

function closeTrade(s: Core, position: Position, exit: Decimal, at: number, reason: ExitReason, units: Decimal = position.units): Core {
  const profit = profitOf(position.side, units, position.entry, exit);
  const trade: ClosedTrade = { side: position.side, units, entry: position.entry, exit, openedAt: position.openedAt, closedAt: at, reason, profit, initialStop: position.initialStop };
  const left = position.units.minus(units);
  return { ...s, balance: s.balance.plus(profit), closed: [...s.closed, trade], position: left.gt(0) ? { ...position, units: left } : null };
}

/** Closes all or `fraction` (0–1] of the position at the last revealed close. */
export function closePosition(state: ReplayState, fraction: Decimal = dec(1)): Result<ReplayState, AppError> {
  const p = state.position;
  if (!p) return err(validationError('There is no open trade'));
  if (fraction.lte(0) || fraction.gt(1)) return err(validationError('Close between 0% and 100% of the trade'));
  const units = fraction.eq(1) ? p.units : p.units.times(fraction);
  return ok(commit(state, closeTrade(core(state), p, lastClose(state), state.visible.length - 1, 'manual', units)));
}

/** Moves the stop loss or take profit of the open trade. */
export function editPosition(state: ReplayState, stopLoss: Decimal | null, takeProfit: Decimal | null): Result<ReplayState, AppError> {
  const p = state.position;
  if (!p) return err(validationError('There is no open trade'));
  const levelError = checkLevels(p.side, lastClose(state), stopLoss ?? undefined, takeProfit ?? undefined);
  if (levelError) return err(levelError);
  return ok(commit(state, { ...core(state), position: { ...p, stopLoss, takeProfit } }));
}

/** Fill price for a pending order on this candle, or null if not reached. Replay charges no costs. */
const fillPrice = (order: PendingOrder, c: Candle): Decimal | null => orderFillPrice(NO_COSTS, order.side, order.type, order.price ?? null, c);

/**
 * Stop loss and take profit on a revealed candle; the stop wins ties. `intrabarEntry`
 * means the trade opened inside this candle (see module comment).
 */
const exitOn = (p: Position, c: Candle, intrabarEntry: boolean): { price: Decimal; reason: ExitReason } | null =>
  exitOnCandle(NO_COSTS, p.side, p.stopLoss, p.takeProfit, c, intrabarEntry);

/** Reveals the next candle, then fills orders and checks stops against it. */
export function nextCandle(state: ReplayState): ReplayState {
  const [candle, ...rest] = state.upcoming;
  if (!candle) return state;
  const at = state.visible.length;
  let s: Core = { ...core(state), visible: [...state.visible, candle], upcoming: rest };
  const order = s.orders[0];
  let intrabarEntry = false;
  if (order && !s.position) {
    const fill = fillPrice(order, candle);
    if (fill) {
      intrabarEntry = filledInsideCandle(NO_COSTS, order.side, order.type, fill, candle);
      s = {
        ...s,
        orders: [],
        position: {
          side: order.side,
          units: order.units,
          entry: fill,
          openedAt: at,
          stopLoss: order.stopLoss ?? null,
          takeProfit: order.takeProfit ?? null,
          initialStop: order.stopLoss ?? null,
        },
      };
    }
  }
  if (s.position) {
    const exit = exitOn(s.position, candle, intrabarEntry);
    if (exit) s = closeTrade(s, s.position, exit.price, at, exit.reason);
    else if (rest.length === 0) s = closeTrade(s, s.position, candle.close, at, 'end_of_data');
  }
  return commit(state, s);
}

export function stepBack(state: ReplayState): ReplayState {
  const prev = state.past[state.past.length - 1];
  if (!prev) return state;
  const { revealed, ...rest } = prev;
  const series = [...state.visible, ...state.upcoming];
  return { ...rest, visible: series.slice(0, revealed), upcoming: series.slice(revealed), past: state.past.slice(0, -1) };
}
