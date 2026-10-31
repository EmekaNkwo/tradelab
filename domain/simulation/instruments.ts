import { dec, type Decimal } from '../../shared/decimal';
import type { MarketKind } from '../../shared/types';

/**
 * Practice instruments for the paper trading simulator (spec §17). Prices
 * come from the scenario generator, so every chart is labelled "Simulated".
 * The specifications below are made-up teaching examples chosen so each
 * market behaves differently; they are not any broker's or exchange's real
 * terms, and screens say so. All are quoted in USD and the practice account
 * is in USD, so no currency conversion is needed.
 */
export interface PracticeInstrument {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly startPrice: number;
  /** Decimal places of the price. */
  readonly precision: number;
  readonly sizeUnit: 'lots' | 'shares' | 'contracts';
  /** Instrument units per 1 size unit (100,000 per forex lot; 1 per share; the multiplier for a future). */
  readonly contractSize: Decimal;
  readonly minSize: Decimal;
  readonly sizeStep: Decimal;
  /** Largest size one order can fill (thin markets); null means no limit. */
  readonly maxOrderSize: Decimal | null;
  /** Price step quoted as one pip or tick. */
  readonly pipSize: Decimal;
  /** Full bid–ask spread, in price units. Candles show the mid price. */
  readonly spread: Decimal;
  /** Extra price paid on market and stop fills (never on limits or take profits). */
  readonly slippage: Decimal;
  /** Commission per size unit, charged on entry and again on exit. */
  readonly commissionPerSide: Decimal;
  readonly margin:
    | { readonly kind: 'cash' }
    | { readonly kind: 'rate'; readonly rate: Decimal }
    | { readonly kind: 'per_contract'; readonly amount: Decimal };
  /** Positions are closed when equity falls below this share of the margin in use. */
  readonly stopOutLevel: Decimal | null;
  /** Overnight financing per size unit for each new day a position is held (negative is a charge). */
  readonly swapLong: Decimal;
  readonly swapShort: Decimal;
  readonly allowShort: boolean;
  /** How this market's mechanics differ, shown to the learner. */
  readonly notes: readonly string[];
}

/** Candles in every paper scenario. Saved cursors and positions index into them, so changing this breaks saved accounts. */
export const PAPER_CANDLE_COUNT = 400;

export const PRACTICE_INSTRUMENTS: readonly PracticeInstrument[] = [
  {
    id: 'sim-eurusd',
    symbol: 'EUR/USD (simulated)',
    name: 'Practice currency pair',
    market: 'forex',
    startPrice: 1.1,
    precision: 5,
    sizeUnit: 'lots',
    contractSize: dec(100000),
    minSize: dec('0.01'),
    sizeStep: dec('0.01'),
    maxOrderSize: null,
    pipSize: dec('0.0001'),
    spread: dec('0.00010'),
    slippage: dec('0.00002'),
    commissionPerSide: dec('3.5'),
    margin: { kind: 'rate', rate: dec('0.0333') },
    stopOutLevel: dec('0.5'),
    swapLong: dec('-6'),
    swapShort: dec('2'),
    allowShort: true,
    notes: [
      'Spot forex: sized in lots of 100,000 units, with leverage.',
      'Margin is about 3.33% of the position value (1:30), an example setting.',
      'Holding past the day change adds or charges swap.',
      'If equity falls below half the margin in use, positions are closed (stop out).',
    ],
  },
  {
    id: 'sim-stock',
    symbol: 'SIMCO (simulated)',
    name: 'Practice ordinary share',
    market: 'stocks',
    startPrice: 85,
    precision: 2,
    sizeUnit: 'shares',
    contractSize: dec(1),
    minSize: dec(1),
    sizeStep: dec(1),
    maxOrderSize: null,
    pipSize: dec('0.01'),
    spread: dec('0.04'),
    slippage: dec('0.01'),
    commissionPerSide: dec('0.01'),
    margin: { kind: 'cash' },
    stopOutLevel: null,
    swapLong: dec(0),
    swapShort: dec(0),
    allowShort: false,
    notes: [
      'A cash account: you pay the full price of the shares, with no leverage.',
      'You can only buy here; short selling is not offered in this practice account.',
      'Commission is charged per share on each side.',
    ],
  },
  {
    id: 'sim-penny',
    symbol: 'TINYCO (simulated)',
    name: 'Practice penny stock',
    market: 'penny_stocks',
    startPrice: 0.42,
    precision: 4,
    sizeUnit: 'shares',
    contractSize: dec(1),
    minSize: dec(100),
    sizeStep: dec(100),
    maxOrderSize: dec(20000),
    pipSize: dec('0.0001'),
    spread: dec('0.0100'),
    slippage: dec('0.0040'),
    commissionPerSide: dec(0),
    margin: { kind: 'cash' },
    stopOutLevel: null,
    swapLong: dec(0),
    swapShort: dec(0),
    allowShort: false,
    notes: [
      'A wide spread: about 2% of the price is lost the moment you buy.',
      'Thin trading: one order can fill at most 20,000 shares, and market and stop fills slip further.',
      'Gaps are common, so a stop can fill well below its level.',
    ],
  },
  {
    id: 'sim-gold',
    symbol: 'GOLD (simulated)',
    name: 'Practice commodity',
    market: 'commodities',
    startPrice: 1900,
    precision: 2,
    sizeUnit: 'lots',
    contractSize: dec(100),
    minSize: dec('0.01'),
    sizeStep: dec('0.01'),
    maxOrderSize: null,
    pipSize: dec('0.01'),
    spread: dec('0.30'),
    slippage: dec('0.05'),
    commissionPerSide: dec(0),
    margin: { kind: 'rate', rate: dec('0.05') },
    stopOutLevel: dec('0.5'),
    swapLong: dec('-4'),
    swapShort: dec('-1'),
    allowShort: true,
    notes: [
      'A commodity traded like a contract for difference: 1 lot is 100 units.',
      'Margin is 5% of the position value, an example setting.',
      'Swap is charged for holding past the day change, in either direction.',
    ],
  },
  {
    id: 'sim-index-future',
    symbol: 'IDX future (simulated)',
    name: 'Practice index future',
    market: 'futures',
    startPrice: 4500,
    precision: 2,
    sizeUnit: 'contracts',
    contractSize: dec(50),
    minSize: dec(1),
    sizeStep: dec(1),
    maxOrderSize: null,
    pipSize: dec('0.25'),
    spread: dec('0.25'),
    slippage: dec('0.25'),
    commissionPerSide: dec('2.5'),
    margin: { kind: 'per_contract', amount: dec(12000) },
    stopOutLevel: dec('0.9'),
    swapLong: dec(0),
    swapShort: dec(0),
    allowShort: true,
    notes: [
      'Whole contracts only. Each point is worth 50 USD, so one tick of 0.25 is 12.50 USD.',
      'A fixed margin per contract (12,000 USD here, an example). Below 90% of it, positions are closed.',
      'Losses can be larger than the margin.',
      'No swap; real futures expire, and holders roll to the next contract. This practice contract ends with the scenario, and open positions are closed then.',
    ],
  },
];

export function practiceInstrument(id: string): PracticeInstrument | null {
  return PRACTICE_INSTRUMENTS.find((i) => i.id === id) ?? null;
}
