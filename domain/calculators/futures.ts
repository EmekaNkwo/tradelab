import type { Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { TradeSide } from './forex';

/**
 * Futures contract arithmetic (spec §10.5). The learner enters the contract's
 * own specification: no tick value, multiplier or margin is assumed, because
 * they differ by contract and change over time.
 */
export interface FuturesInput {
  readonly side: TradeSide;
  readonly contracts: Decimal;
  readonly tickSize: Decimal;
  /** Money gained or lost per contract when price moves one tick. */
  readonly tickValue: Decimal;
  readonly entry: Decimal;
  readonly exit: Decimal;
  /** Per contract. */
  readonly initialMargin: Decimal;
  /** Per contract. */
  readonly maintenanceMargin: Decimal;
  /** Money in the account before the trade. */
  readonly balance: Decimal;
}

export interface FuturesResult {
  /** Money per one full point of price, per contract (tick value ÷ tick size). */
  readonly pointValue: Decimal;
  /** Signed: positive when price moved in the trade's favour. */
  readonly ticks: Decimal;
  readonly profitLoss: Decimal;
  readonly notional: Decimal;
  readonly initialMarginTotal: Decimal;
  /** Notional ÷ initial margin. */
  readonly leverage: Decimal;
  /** Price at which equity falls to the maintenance margin; null when a long would need a price of zero or below. */
  readonly marginCallPrice: Decimal | null;
  /** Price at which the loss equals the whole balance; price can go further, so losses can exceed it. Null as above. */
  readonly balanceGonePrice: Decimal | null;
  /** Balance plus profit or loss; can be negative. */
  readonly equityAfter: Decimal;
}

const fail = (message: string, field: string): Result<never, AppError> => err(validationError(message, { issues: [field] }));

export function futuresTrade(input: FuturesInput): Result<FuturesResult, AppError> {
  const { side, contracts, tickSize, tickValue, entry, exit, initialMargin, maintenanceMargin, balance } = input;
  if (!contracts.isInteger() || contracts.lt(1)) return fail('Contracts must be a whole number of at least 1', 'contracts');
  if (tickSize.lte(0)) return fail('Tick size must be more than 0', 'tickSize');
  if (tickValue.lte(0)) return fail('Tick value must be more than 0', 'tickValue');
  if (entry.lte(0)) return fail('Entry price must be more than 0', 'entry');
  if (exit.lte(0)) return fail('Exit price must be more than 0', 'exit');
  if (initialMargin.lte(0)) return fail('Initial margin must be more than 0', 'initialMargin');
  if (maintenanceMargin.lte(0) || maintenanceMargin.gt(initialMargin)) return fail('Maintenance margin must be more than 0 and no more than the initial margin', 'maintenanceMargin');
  const move = exit.minus(entry);
  if (!move.mod(tickSize).isZero()) return fail('Prices move in whole ticks: the move from entry to exit must be a multiple of the tick size', 'exit');
  const initialMarginTotal = initialMargin.times(contracts);
  if (balance.lt(initialMarginTotal)) return fail('The balance is less than the initial margin, so this trade could not be opened', 'balance');

  const direction = side === 'buy' ? 1 : -1;
  const pointValue = tickValue.div(tickSize);
  const ticks = move.div(tickSize).times(direction);
  const profitLoss = ticks.times(tickValue).times(contracts);
  const notional = entry.times(pointValue).times(contracts);
  const perPoint = pointValue.times(contracts);
  const toMarginCall = balance.minus(maintenanceMargin.times(contracts)).div(perPoint);
  const toZero = balance.div(perPoint);
  const against = (points: Decimal): Decimal | null => {
    const level = side === 'buy' ? entry.minus(points) : entry.plus(points);
    return level.gt(0) ? level : null;
  };
  return ok({
    pointValue,
    ticks,
    profitLoss,
    notional,
    initialMarginTotal,
    leverage: notional.div(initialMarginTotal),
    marginCallPrice: against(toMarginCall),
    balanceGonePrice: against(toZero),
    equityAfter: balance.plus(profitLoss),
  });
}
