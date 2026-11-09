import type { StudyMarket } from '../../shared/types';
import type { ContentLevel } from '../models/content';
import type { AnalysisKind, Strategy, StrategyCategory, StrategyFamily, StrategyHorizon, StrategyStyle } from '../models/strategies';

/**
 * Strategy Library search and filters (spec §16.1). Pure and deterministic:
 * every filter is an "any of" set, and an empty set means "no filter".
 */

export type ExerciseKind = 'chart_demo' | 'replay' | 'guided_exercise' | 'knowledge_check';
export const EXERCISE_KINDS: readonly ExerciseKind[] = ['chart_demo', 'replay', 'guided_exercise', 'knowledge_check'];

export type TraderAssociation = 'with_trader' | 'generic';
export const TRADER_ASSOCIATIONS: readonly TraderAssociation[] = ['with_trader', 'generic'];

export interface LibraryFilters {
  readonly markets: readonly StudyMarket[];
  readonly categories: readonly StrategyCategory[];
  readonly families: readonly StrategyFamily[];
  readonly levels: readonly ContentLevel[];
  readonly horizons: readonly StrategyHorizon[];
  readonly styles: readonly StrategyStyle[];
  readonly analysis: readonly AnalysisKind[];
  readonly traders: readonly TraderAssociation[];
  /** Strategies offering at least one of these. */
  readonly exercises: readonly ExerciseKind[];
}

export const NO_FILTERS: LibraryFilters = {
  markets: [],
  categories: [],
  families: [],
  levels: [],
  horizons: [],
  styles: [],
  analysis: [],
  traders: [],
  exercises: [],
};

export function exercisesOf(s: Strategy): readonly ExerciseKind[] {
  return [
    ...(s.demo ? (['chart_demo'] as const) : []),
    ...(s.replay ? (['replay'] as const) : []),
    ...(s.exercise ? (['guided_exercise'] as const) : []),
    ...(s.knowledgeCheck.length > 0 ? (['knowledge_check'] as const) : []),
  ];
}

const anyOf = <T>(wanted: readonly T[], has: readonly T[]) => wanted.length === 0 || has.some((h) => wanted.includes(h));

export function matchesFilters(s: Strategy, f: LibraryFilters): boolean {
  return (
    anyOf(f.markets, s.markets) &&
    anyOf(f.categories, [s.category]) &&
    anyOf(f.families, [s.family]) &&
    anyOf(f.levels, [s.level]) &&
    anyOf(f.horizons, [s.horizon]) &&
    anyOf(f.styles, [s.style]) &&
    anyOf(f.analysis, [s.analysis]) &&
    anyOf(f.traders, [s.traderIds.length > 0 ? 'with_trader' : 'generic']) &&
    anyOf(f.exercises, exercisesOf(s))
  );
}

const normalise = (t: string) => t.toLowerCase().replace(/\[\[[^|\]]+\|([^\]]+)\]\]|\[\[([^\]]+)\]\]/g, '$1$2');

/**
 * Every word of the query must appear in the strategy's title, overview,
 * simple explanation, or the names of its traders.
 */
export function matchesQuery(s: Strategy, query: string, traderNames: readonly string[] = []): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalise([s.title, s.overview.objective, s.overview.context, s.simple.simple, s.family.replace(/_/g, ' '), ...traderNames].join(' '));
  return words.every((w) => haystack.includes(w));
}

export interface LibraryGroup {
  readonly category: StrategyCategory;
  readonly strategies: readonly Strategy[];
}

/**
 * Matching strategies grouped by category (trading, investing, risk
 * principles kept apart), by title within each; empty groups are left out.
 */
export function searchLibrary(
  strategies: readonly Strategy[],
  query: string,
  filters: LibraryFilters,
  traderName: (id: string) => string | null = () => null,
): readonly LibraryGroup[] {
  const order: readonly StrategyCategory[] = ['trading', 'investing', 'risk_principle'];
  const found = strategies.filter(
    (s) => matchesFilters(s, filters) && matchesQuery(s, query, s.traderIds.map(traderName).filter((n): n is string => n !== null)),
  );
  return order
    .map((category) => ({ category, strategies: found.filter((s) => s.category === category).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter((g) => g.strategies.length > 0);
}

export function activeFilterCount(f: LibraryFilters): number {
  return Object.values(f).reduce((n, v: readonly unknown[]) => n + v.length, 0);
}
