/** Cross-layer primitive types. Domain-specific models live in `domain/models`. */

export type MarketKind = 'forex' | 'stocks' | 'penny_stocks' | 'commodities' | 'futures';
export const MARKET_KINDS: readonly MarketKind[] = ['forex', 'stocks', 'penny_stocks', 'commodities', 'futures'];
export const MARKET_LABELS: Readonly<Record<MarketKind, string>> = { forex: 'Forex', stocks: 'Stocks', penny_stocks: 'Penny stocks', commodities: 'Commodities', futures: 'Futures' };

/**
 * Markets a learner can study: the simulated markets plus options. Options are taught in lessons only; there is no
 * options price data, simulator or paper trading, so `MarketKind` (which drives those) does not include them.
 */
export type StudyMarket = MarketKind | 'options';
export const STUDY_MARKETS: readonly StudyMarket[] = [...MARKET_KINDS, 'options'];
export const STUDY_MARKET_LABELS: Readonly<Record<StudyMarket, string>> = { ...MARKET_LABELS, options: 'Options' };

export type ExplanationLevel = 'simple' | 'balanced' | 'advanced';
export const EXPLANATION_LEVELS: readonly ExplanationLevel[] = ['simple', 'balanced', 'advanced'];

/**
 * Where a record came from (spec §32A.3). Every simulated, demo, or imported
 * record carries one so sources are never mixed silently.
 */
export type RecordSource = 'simulated' | 'replay' | 'paper' | 'mt_manual' | 'mt_import' | 'live_provider';
export const RECORD_SOURCES: readonly RecordSource[] = [
  'simulated',
  'replay',
  'paper',
  'mt_manual',
  'mt_import',
  'live_provider',
];

export type ThemePreference = 'system' | 'light' | 'dark';
