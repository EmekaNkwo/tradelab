import type { Decimal } from '../../shared/decimal';
import type { MarketKind } from '../../shared/types';
import type { UtcIso } from '../../shared/time';

/**
 * Market data models (spec §30). Prices are always Decimal. Every dataset
 * records its source and whether it is real history or simulated.
 */

export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1';

export type DataOrigin = 'historical' | 'simulated' | 'live_provider' | 'delayed_provider' | 'user_import';

export type DataQualityStatus = 'unchecked' | 'valid' | 'valid_with_warnings' | 'invalid';

export interface Candle {
  /** Candle open time, UTC. */
  readonly time: UtcIso;
  readonly open: Decimal;
  readonly high: Decimal;
  readonly low: Decimal;
  readonly close: Decimal;
  readonly volume: Decimal | null;
}

/**
 * Contract specification. Never assume specs are shared between instruments
 * (spec §10.5); unknown values stay null and calculators must refuse rather
 * than guess.
 */
export interface ContractSpec {
  readonly instrumentId: string;
  readonly contractSize: Decimal | null;
  readonly tickSize: Decimal | null;
  readonly tickValue: Decimal | null;
  readonly multiplier: Decimal | null;
  readonly pricePrecision: number;
  readonly quoteCurrency: string;
  readonly initialMargin: Decimal | null;
  readonly maintenanceMargin: Decimal | null;
  readonly settlement: 'physical' | 'cash' | null;
  readonly source: string;
}

export interface MarketInstrument {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly venue: string | null;
  readonly currency: string;
  readonly timeZone: string;
}

export interface DataSource {
  readonly id: string;
  readonly name: string;
  readonly licence: string;
  readonly redistributionPermitted: boolean;
  readonly url: string | null;
  readonly notes: string;
}

export interface HistoricalDataset {
  readonly id: string;
  readonly instrumentId: string;
  readonly timeframe: Timeframe;
  readonly origin: DataOrigin;
  readonly dataSourceId: string;
  readonly from: UtcIso;
  readonly to: UtcIso;
  readonly quality: DataQualityStatus;
  /** Label shown on every chart that uses this data, e.g. "Simulated". */
  readonly displayLabel: string;
}

export function datasetLabel(origin: DataOrigin, sourceName: string): string {
  switch (origin) {
    case 'simulated':
      return 'Simulated';
    case 'live_provider':
      return `Live · ${sourceName}`;
    case 'delayed_provider':
      return `Delayed · ${sourceName}`;
    case 'user_import':
      return `Imported · ${sourceName}`;
    case 'historical':
      return `Historical · ${sourceName}`;
  }
}
