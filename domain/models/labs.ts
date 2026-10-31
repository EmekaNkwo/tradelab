import type { MarketKind } from '../../shared/types';
import type { SkillId } from './progress';
import type { ContentLevel } from './content';

/**
 * Phase 7 lab content: fictional companies, penny-stock red-flag cases,
 * macro and commodity scenarios, the market comparison, and the concept maps
 * of the Technical and Fundamental Analysis Labs (spec §10–§12).
 * Everything is fictional or general; no real firm, figure or event.
 */

/** One year of a fictional company's figures, in millions of the company's currency. */
export interface CompanyYear {
  /** A label such as "Year 1": never a real calendar year. */
  readonly label: string;
  readonly revenue: number;
  readonly costOfSales: number;
  readonly operatingExpenses: number;
  readonly interest: number;
  readonly tax: number;
  readonly operatingCashFlow: number;
  readonly capitalExpenditure: number;
  readonly dividendsPaid: number;
  readonly cash: number;
  readonly debt: number;
  readonly equity: number;
}

/** A fictional company for the company-analysis screen (spec §10.2, §12). */
export interface FictionalCompany {
  readonly id: string;
  /** Must say it is fictional, e.g. "Northwind Tools (fictional)". */
  readonly name: string;
  readonly sector: string;
  readonly summary: string;
  /** The stated assumptions the comparison rests on. */
  readonly assumptions: string;
  readonly currency: 'USD';
  readonly sharePrice: number;
  /** In millions. */
  readonly sharesOutstanding: number;
  /** Oldest first; at least two years so growth can be shown. */
  readonly years: readonly CompanyYear[];
  /** Qualitative points: competitive position, business quality, management risks. */
  readonly notes: readonly string[];
  readonly glossaryIds: readonly string[];
}

export interface CaseFact {
  readonly label: string;
  readonly value: string;
}

export interface RedFlagOption {
  readonly id: string;
  readonly text: string;
  readonly isRedFlag: boolean;
  readonly explanation: string;
}

/** Penny Stock Red Flag Detector case (spec §10.3): a fictional profile to examine. */
export interface RedFlagCase {
  readonly id: string;
  readonly title: string;
  /** Fictional company name, saying it is fictional. */
  readonly company: string;
  readonly facts: readonly CaseFact[];
  readonly question: string;
  /** Signs to judge; the learner picks the ones that are warning signs. */
  readonly signs: readonly RedFlagOption[];
  /** What to investigate before doing anything. */
  readonly investigate: readonly string[];
  /** The lesson of the case, including when staying out is the best decision. */
  readonly verdict: string;
  readonly glossaryIds: readonly string[];
}

export interface ScenarioRelease {
  readonly name: string;
  readonly unit: string;
  readonly consensus: number;
  readonly actual: number;
  readonly previous: number | null;
}

export interface ScenarioReaction {
  readonly id: string;
  readonly text: string;
  /** Whether this reaction is a plausible outcome given the setup (several can be). */
  readonly plausible: boolean;
  readonly explanation: string;
}

/**
 * A macro or commodity "what could happen?" scenario (spec §10.4, §12):
 * actual vs expected vs what was priced in. Fictional and never a forecast.
 */
export interface MarketScenario {
  readonly id: string;
  readonly category: 'macro' | 'commodity';
  readonly title: string;
  readonly setup: string;
  readonly release: ScenarioRelease | null;
  /** What the market was already expecting or positioned for. */
  readonly pricedIn: string;
  readonly question: string;
  readonly reactions: readonly ScenarioReaction[];
  readonly takeaway: string;
  readonly glossaryIds: readonly string[];
}

/** One row of the market comparison (spec §10.6). */
export interface ComparisonDimension {
  readonly id: string;
  readonly order: number;
  readonly dimension: string;
  readonly cells: Readonly<Record<MarketKind, string>>;
  /** What this row depends on (exchange, broker, jurisdiction, conditions). */
  readonly caveat: string;
}

/** A Chart Lab setup a concept opens with (spec §11 "annotated chart"). */
export interface ChartPreset {
  readonly scenario: string;
  readonly overlays: readonly string[];
  readonly pane: string;
  /** What to look for on the chart. */
  readonly lookFor: string;
}

/** One concept of the Technical or Fundamental Analysis Lab (spec §11, §12). */
export interface LabConcept {
  readonly id: string;
  readonly lab: 'technical' | 'fundamental';
  readonly level: ContentLevel;
  readonly order: number;
  readonly title: string;
  readonly summary: string;
  /** When the concept is unreliable or misleads. */
  readonly unreliableWhen: string;
  /** A positive example and a negative example, in words. */
  readonly goodExample: string;
  readonly badExample: string;
  readonly lessonIds: readonly string[];
  readonly chart: ChartPreset | null;
  /** A drill that practises it ("find it"), when one exists. */
  readonly drillKind: string | null;
  readonly scenarioIds: readonly string[];
  readonly companyIds: readonly string[];
  readonly redFlagCaseIds: readonly string[];
  readonly skills: readonly SkillId[];
}

/** Strategy pages (Phase 8) record their guided exercise and knowledge check here too. */
export type LabAttemptKind = 'red_flag' | 'scenario' | 'strategy_exercise' | 'strategy_check';

/** A finished red-flag case or market scenario: what the learner picked and how much matched. */
export interface LabAttempt {
  readonly id: string;
  readonly kind: LabAttemptKind;
  readonly refId: string;
  readonly picked: readonly string[];
  /** Share of options judged correctly, 0 to 1. */
  readonly score: number;
  readonly answeredAt: string;
}
