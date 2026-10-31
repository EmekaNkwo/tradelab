import type { MarketKind } from '../../shared/types';
import type { ContentLevel, LevelledText, Question, SourceQuality } from './content';
import type { SkillId } from './progress';

/**
 * Strategy Library and Famous Traders content (spec §15, §16.1, §26).
 *
 * Attribution rule (spec §15.1): anything that names a trader, or claims to
 * be a trader's documented rules, ships only after a person has researched
 * and reviewed it against reviewed sources. The build enforces this
 * (`data/content/attributionGate.ts`); generic strategy families carry no
 * attribution and need no review.
 */

/** Investing, trading and risk principles are separate categories (spec §16.1). */
export type StrategyCategory = 'trading' | 'investing' | 'risk_principle';

export const STRATEGY_CATEGORIES: readonly StrategyCategory[] = ['trading', 'investing', 'risk_principle'];

export type StrategyFamily =
  | 'trend_following'
  | 'breakout'
  | 'pullback'
  | 'mean_reversion'
  | 'range'
  | 'carry'
  | 'seasonality'
  | 'income'
  | 'value'
  | 'growth'
  | 'risk_management';

export const STRATEGY_FAMILIES: readonly StrategyFamily[] = [
  'trend_following',
  'breakout',
  'pullback',
  'mean_reversion',
  'range',
  'carry',
  'seasonality',
  'income',
  'value',
  'growth',
  'risk_management',
];

export type StrategyHorizon = 'intraday' | 'swing' | 'position' | 'long_term';
export const STRATEGY_HORIZONS: readonly StrategyHorizon[] = ['intraday', 'swing', 'position', 'long_term'];

export type StrategyStyle = 'rules_based' | 'discretionary';
export const STRATEGY_STYLES: readonly StrategyStyle[] = ['rules_based', 'discretionary'];

export type AnalysisKind = 'technical' | 'fundamental' | 'quantitative' | 'mixed';
export const ANALYSIS_KINDS: readonly AnalysisKind[] = ['technical', 'fundamental', 'quantitative', 'mixed'];

/**
 * `generic`: a family of ideas with no named author, written as a simplified
 * educational version. `documented`: rules attributed to a person or source,
 * which must pass human review before release.
 */
export type AttributionKind = 'generic' | 'documented';

/** A person's sign-off that content was checked against its sources (spec §15.1). */
export interface HumanReview {
  readonly status: 'human_reviewed';
  readonly reviewer: string;
  readonly reviewedAt: string;
}

/** A Chart Lab setup for the visual demo (reuses the lab presets). */
export interface StrategyDemo {
  readonly scenario: string;
  readonly overlays: readonly string[];
  readonly pane: string;
  readonly lookFor: string;
}

export interface StrategyRuleSet {
  /** States what the rules are, e.g. "A simplified educational version, not any trader's system". */
  readonly label: string;
  readonly rules: readonly string[];
}

export interface StrategyExerciseOption {
  readonly id: string;
  readonly text: string;
  /** True when the option should be picked. */
  readonly correct: boolean;
  readonly explanation: string;
}

/** A guided "pick all that apply" exercise, assessed option by option. */
export interface StrategyExercise {
  readonly prompt: string;
  /** Fictional situation the exercise is about. */
  readonly situation: string;
  readonly options: readonly StrategyExerciseOption[];
}

/** Evidence and attribution (spec §15.3 item 2). */
export interface StrategyEvidence {
  readonly level: SourceQuality;
  readonly summary: string;
  readonly sourceIds: readonly string[];
}

/** A strategy page following the standard template (spec §15.3). Sections that are absent are not shown. */
export interface Strategy {
  readonly id: string;
  readonly title: string;
  readonly category: StrategyCategory;
  readonly family: StrategyFamily;
  readonly markets: readonly MarketKind[];
  readonly level: ContentLevel;
  readonly horizon: StrategyHorizon;
  readonly style: StrategyStyle;
  readonly analysis: AnalysisKind;
  readonly attribution: AttributionKind;
  /** Empty for generic families. */
  readonly traderIds: readonly string[];
  readonly overview: { readonly objective: string; readonly holdingPeriod: string; readonly context: string };
  readonly evidence: StrategyEvidence | null;
  readonly simple: LevelledText;
  /** Why it might work, kept apart from what the evidence shows. */
  readonly reasoning: string;
  readonly rules: StrategyRuleSet | null;
  readonly demo: StrategyDemo | null;
  /** Practise in Replay on a simulated scenario. */
  readonly replay: { readonly scenario: string; readonly instructions: string } | null;
  readonly exercise: StrategyExercise | null;
  readonly failureAnalysis: readonly string[];
  readonly limitations: readonly string[];
  readonly knowledgeCheck: readonly Question[];
  readonly lessonIds: readonly string[];
  readonly glossaryIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly review: HumanReview | null;
  /** Skills its knowledge check and exercise give evidence for (spec §23). */
  readonly skills: readonly SkillId[];
}

/** A statement about a trader, with the sources that support it. */
export interface SourcedStatement {
  readonly text: string;
  readonly sourceIds: readonly string[];
}

/** A famous-trader page (spec §15.2). Only ever written and reviewed by a person. */
export interface Trader {
  readonly id: string;
  readonly name: string;
  readonly markets: readonly MarketKind[];
  readonly knownFor: string;
  readonly summary: string;
  /** What the sources document. */
  readonly documented: readonly SourcedStatement[];
  /** Later interpretations, labelled as such. */
  readonly interpretations: readonly SourcedStatement[];
  /** Claims that circulate but could not be verified. */
  readonly unverified: readonly string[];
  readonly strategyIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly review: HumanReview | null;
}

/** Saved strategies: bookmarks and the personal study list (spec §16.1). */
export type SavedListKind = 'bookmark' | 'study';

export interface SavedStrategy {
  readonly strategyId: string;
  readonly list: SavedListKind;
  readonly addedAt: string;
}
