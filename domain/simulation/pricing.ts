import type { Decimal } from '../../shared/decimal';
import { closePrice, DEFAULT_LIMIT_RULE, exitOnCandle, openPrice, orderFillPrice, type CandleExit, type FillCosts, type FillOrderType } from '../market/fills';
import type { Side } from '../market/replay';
import type { Candle } from '../models/markets';
import type { PracticeInstrument } from './instruments';

/**
 * Fill model for paper trading (spec §17, §32A.5): the shared execution
 * conventions in `domain/market/fills.ts`, with this instrument's spread and
 * slippage, and the default "through" rule for limits and targets. Stop outs
 * also pay slippage.
 */

export const halfSpread = (i: PracticeInstrument): Decimal => i.spread.div(2);
export const direction = (side: Side): number => (side === 'buy' ? 1 : -1);

/** The instrument's costs in the shared fill model (`domain/market/fills.ts`). */
export const fillCosts = (i: PracticeInstrument): FillCosts => ({ halfSpread: halfSpread(i), slippage: i.slippage, limitRule: DEFAULT_LIMIT_RULE });

/** Price paid to open (buy at the ask, sell at the bid), with slippage when `slip`. */
export const entryAt = (i: PracticeInstrument, side: Side, mid: Decimal, slip: boolean): Decimal => openPrice(fillCosts(i), side, mid, slip);

/** Price received to close a position of `side` (a buy closes at the bid), with slippage when `slip`. */
export const exitAt = (i: PracticeInstrument, side: Side, mid: Decimal, slip: boolean): Decimal => closePrice(fillCosts(i), side, mid, slip);

export type PendingType = FillOrderType;

/** Fill price of an order on this candle, or null if its price was not reached. */
export const orderFill = (i: PracticeInstrument, side: Side, type: PendingType, price: Decimal | null, c: Candle): Decimal | null =>
  orderFillPrice(fillCosts(i), side, type, price, c);

export type Exit = CandleExit;

/**
 * Stop loss or take profit hit on this candle. A buy position closes on the
 * bid, a sell on the ask. On the candle where the position opened inside the
 * bar (`intrabarEntry`), only the stop is checked, at its level: the rest of
 * the candle may have happened before the entry.
 */
export const exitOn = (i: PracticeInstrument, side: Side, stopLoss: Decimal | null, takeProfit: Decimal | null, c: Candle, intrabarEntry: boolean): Exit | null =>
  exitOnCandle(fillCosts(i), side, stopLoss, takeProfit, c, intrabarEntry);

/** Money locked to hold `size` at `price`. */
export function marginFor(i: PracticeInstrument, size: Decimal, price: Decimal): Decimal {
  switch (i.margin.kind) {
    case 'cash':
      return price.times(size).times(i.contractSize);
    case 'rate':
      return price.times(size).times(i.contractSize).times(i.margin.rate);
    case 'per_contract':
      return i.margin.amount.times(size);
  }
}

/** Profit before costs of moving from `entry` to `exit`. */
export function grossProfit(i: PracticeInstrument, side: Side, size: Decimal, entry: Decimal, exit: Decimal): Decimal {
  return exit.minus(entry).times(size).times(i.contractSize).times(direction(side));
}

/**
 * Planned loss if the stop fills at its level, from an entry at mid price
 * `reference`: the price distance, the half spread paid on entry, and both
 * commissions. Slippage and gaps can make it larger.
 */
export function plannedLoss(i: PracticeInstrument, side: Side, size: Decimal, reference: Decimal, stopLoss: Decimal): Decimal {
  const distance = reference.minus(stopLoss).times(direction(side));
  return distance
    .plus(halfSpread(i))
    .times(size)
    .times(i.contractSize)
    .plus(i.commissionPerSide.times(size).times(2));
}
