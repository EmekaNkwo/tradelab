import { CONTRACT_INSTRUMENT_FOR_MARKET, type DatasetSummary } from '../../domain/models/marketData';

/** Saved data a strategy can be backtested on: the same practice market and the same timeframe. */
export function datasetsFor(all: readonly DatasetSummary[], instrumentId: string, timeframe: string): readonly DatasetSummary[] {
  return all.filter((d) => d.timeframe === timeframe && CONTRACT_INSTRUMENT_FOR_MARKET[d.market] === instrumentId);
}
