import { useMemo } from 'react';
import { priceFit, typicalPrice, type PriceFit } from '../../domain/marketData/priceFit';
import type { Candle } from '../../domain/models/markets';
import { practiceInstrument } from '../../domain/simulation/instruments';

/** How well a practice market's costs fit real candles, or null when either is missing. */
export function fitFor(candles: readonly Candle[] | null, instrumentId: string): PriceFit | null {
  const instrument = practiceInstrument(instrumentId);
  const price = candles ? typicalPrice(candles) : null;
  return instrument && price !== null ? priceFit(instrument, price) : null;
}

export function usePriceFit(candles: readonly Candle[] | null, instrumentId: string): PriceFit | null {
  return useMemo(() => fitFor(candles, instrumentId), [candles, instrumentId]);
}

export const ROUGH_ESTIMATE_NOTE = 'Rough estimate — check your broker.';
