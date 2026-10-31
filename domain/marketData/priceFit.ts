import { dec } from '../../shared/decimal';
import type { Candle } from '../models/markets';
import type { PracticeInstrument } from '../simulation/instruments';

/**
 * Real data borrows a practice market's contract terms and costs (spec §30).
 * Those are teaching examples sized for the practice market's own price, so
 * when real prices are far from it, the default spread, slippage and pip
 * value no longer make sense and the learner must set the costs themselves.
 */

/** Real prices more than this many times above or below the practice market's price do not fit its costs. */
export const PRICE_FIT_RATIO = 3;

export interface PriceFit {
  /** The data's price divided by the practice market's reference price. */
  readonly ratio: number;
  readonly fits: boolean;
  /** The default costs scaled to the data's price level: a rough estimate only. */
  readonly estimatedSpread: string;
  readonly estimatedSlippage: string;
  /** Shown when the costs do not fit; null when they do. */
  readonly warning: string | null;
}

/** The median close: a price level that one spike cannot move. */
export function typicalPrice(candles: readonly Candle[]): number | null {
  if (candles.length === 0) return null;
  const closes = candles.map((c) => Number(c.close.toString())).sort((a, b) => a - b);
  return closes[Math.floor(closes.length / 2)] ?? null;
}

const roughly = (value: number) => dec(value).toSignificantDigits(2).toString();

export function priceFit(instrument: PracticeInstrument, dataPrice: number): PriceFit {
  const ratio = dataPrice / instrument.startPrice;
  const fits = Number.isFinite(ratio) && ratio <= PRICE_FIT_RATIO && ratio >= 1 / PRICE_FIT_RATIO;
  const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    ratio,
    fits,
    estimatedSpread: roughly(Number(instrument.spread.toString()) * scale),
    estimatedSlippage: roughly(Number(instrument.slippage.toString()) * scale),
    warning: fits
      ? null
      : `This data trades around ${roughly(dataPrice)}, but the practice market whose contract terms are used (${instrument.name}) is around ${roughly(instrument.startPrice)}. Its default costs and pip value do not fit this market, so results in money, pips and costs can be far off.`,
  };
}
