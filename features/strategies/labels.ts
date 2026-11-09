import type { ExerciseKind, LibraryFilters, TraderAssociation } from '../../domain/strategies';
import { EXERCISE_KINDS, TRADER_ASSOCIATIONS } from '../../domain/strategies';
import type { SourceQuality, SourceType } from '../../domain/models/content';
import {
  ANALYSIS_KINDS,
  STRATEGY_CATEGORIES,
  STRATEGY_FAMILIES,
  STRATEGY_HORIZONS,
  STRATEGY_STYLES,
  type AnalysisKind,
  type StrategyCategory,
  type StrategyFamily,
  type StrategyHorizon,
  type StrategyStyle,
} from '../../domain/models/strategies';
import { STUDY_MARKETS, STUDY_MARKET_LABELS } from '../../shared/types';

/** Display labels for the Strategy Library (spec §16.1). */
export const CATEGORY_LABELS: Readonly<Record<StrategyCategory, string>> = {
  trading: 'Trading strategies',
  investing: 'Investing approaches',
  risk_principle: 'Risk principles',
};

export const FAMILY_LABELS: Readonly<Record<StrategyFamily, string>> = {
  trend_following: 'Trend following',
  breakout: 'Breakout',
  pullback: 'Pullback',
  mean_reversion: 'Mean reversion',
  range: 'Range trading',
  carry: 'Carry',
  seasonality: 'Seasonality',
  income: 'Dividends and index',
  value: 'Value',
  growth: 'Growth',
  risk_management: 'Risk management',
};

export const HORIZON_LABELS: Readonly<Record<StrategyHorizon, string>> = {
  intraday: 'Intraday',
  swing: 'Days to weeks',
  position: 'Weeks to months',
  long_term: 'Years',
};

export const STYLE_LABELS: Readonly<Record<StrategyStyle, string>> = { rules_based: 'Rules-based', discretionary: 'Discretionary' };

export const ANALYSIS_LABELS: Readonly<Record<AnalysisKind, string>> = {
  technical: 'Technical',
  fundamental: 'Fundamental',
  quantitative: 'Quantitative',
  mixed: 'Mixed',
};

export const TRADER_LABELS: Readonly<Record<TraderAssociation, string>> = { with_trader: 'Linked to a trader', generic: 'No trader named' };

export const EXERCISE_LABELS: Readonly<Record<ExerciseKind, string>> = {
  chart_demo: 'Chart demo',
  replay: 'Replay practice',
  guided_exercise: 'Guided exercise',
  knowledge_check: 'Knowledge check',
};

export const LEVEL_NAMES = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

export const SOURCE_QUALITY_LABELS: Readonly<Record<SourceQuality, string>> = {
  primary: 'Primary source',
  strong_secondary: 'Strong secondary source',
  limited_or_disputed: 'Limited or disputed',
};

export const SOURCE_TYPE_LABELS: Readonly<Record<SourceType, string>> = {
  book: 'Book',
  interview: 'Interview',
  article: 'Article',
  academic: 'Academic',
  regulator: 'Regulator',
  dataset: 'Dataset',
  website: 'Website',
  other: 'Other',
};

type Dimension = keyof LibraryFilters;

export interface FilterDimension {
  readonly key: Dimension;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

const opts = <T extends string>(values: readonly T[], labels: Readonly<Record<T, string>>) => values.map((value) => ({ value, label: labels[value] }));

/** Every filter the library offers, in display order. */
export const FILTER_DIMENSIONS: readonly FilterDimension[] = [
  { key: 'categories', label: 'Category', options: opts(STRATEGY_CATEGORIES, CATEGORY_LABELS) },
  { key: 'markets', label: 'Market', options: opts(STUDY_MARKETS, STUDY_MARKET_LABELS) },
  { key: 'families', label: 'Type', options: opts(STRATEGY_FAMILIES, FAMILY_LABELS) },
  { key: 'levels', label: 'Level', options: opts(['beginner', 'intermediate', 'advanced'] as const, LEVEL_NAMES) },
  { key: 'horizons', label: 'Holding period', options: opts(STRATEGY_HORIZONS, HORIZON_LABELS) },
  { key: 'styles', label: 'Rules-based or discretionary', options: opts(STRATEGY_STYLES, STYLE_LABELS) },
  { key: 'analysis', label: 'Analysis', options: opts(ANALYSIS_KINDS, ANALYSIS_LABELS) },
  { key: 'traders', label: 'Trader association', options: opts(TRADER_ASSOCIATIONS, TRADER_LABELS) },
  { key: 'exercises', label: 'Available exercises', options: opts(EXERCISE_KINDS, EXERCISE_LABELS) },
];

/** The filters, without market choices no strategy covers (a chip that can only show "No strategies match" is a dead end). */
export function filterDimensionsFor(strategies: readonly { readonly markets: readonly string[] }[]): readonly FilterDimension[] {
  const used = new Set(strategies.flatMap((s) => s.markets));
  return FILTER_DIMENSIONS.map((d) => (d.key === 'markets' ? { ...d, options: d.options.filter((o) => used.has(o.value)) } : d));
}
