import type { ExplanationLevel } from '../../shared/types';

/**
 * The coach (spec §24). Every reply is labelled; facts that come from tested
 * code (rule breaks, metrics, grades) are passed in and shown apart from the
 * coach's text, so the coach is never their authority and cannot change
 * them.
 */
export type CoachTask = 'explain_concept' | 'extra_practice' | 'review_journal' | 'explain_backtest';

export const COACH_TASK_LABELS: Readonly<Record<CoachTask, string>> = {
  explain_concept: 'Explain a concept',
  extra_practice: 'Extra practice',
  review_journal: 'Review a journal entry or trade',
  explain_backtest: 'Explain a backtest report',
};

export interface ConceptContext {
  readonly term: string;
  /** The app's own definition at the learner's level, when the term is in the glossary. */
  readonly definition: string | null;
  readonly example: string | null;
  readonly related: readonly string[];
  readonly lessonTitles: readonly string[];
}

/** A journal entry as facts. Rule breaks and the process score come from the app's code. */
export interface JournalContext {
  readonly instrument: string;
  readonly side: 'buy' | 'sell';
  readonly source: string;
  readonly hadStop: boolean;
  readonly hadTarget: boolean;
  readonly plannedRiskPercent: string | null;
  readonly riskLimitPercent: string;
  readonly ruleBreaks: readonly string[];
  readonly processScorePercent: number | null;
  readonly rationale: string;
  readonly review: string;
  readonly emotions: readonly string[];
  /** The learner's strategy rules, only with strategy consent. */
  readonly strategyRules: readonly string[] | null;
}

/** A backtest report as facts: the engine's metrics and warnings, never the price data. */
export interface BacktestContext {
  readonly strategyName: string;
  readonly dataLabel: string;
  readonly metrics: readonly { readonly label: string; readonly value: string }[];
  readonly warnings: readonly string[];
  /** The strategy's rules in plain English, only with strategy consent. */
  readonly strategyRules: readonly string[] | null;
}

export type CoachRequest =
  | { readonly task: 'explain_concept'; readonly level: ExplanationLevel; readonly concept: ConceptContext; readonly question: string }
  | { readonly task: 'extra_practice'; readonly level: ExplanationLevel; readonly concept: ConceptContext }
  | { readonly task: 'review_journal'; readonly level: ExplanationLevel; readonly journal: JournalContext }
  | { readonly task: 'explain_backtest'; readonly level: ExplanationLevel; readonly backtest: BacktestContext };

export type CoachSource = 'curated' | 'cloud';

export const AI_SUGGESTION_LABEL = 'AI suggestion';
export const CURATED_LABEL = 'From the app’s own lessons (not AI)';

export interface CoachReply {
  readonly source: CoachSource;
  /** "AI suggestion" for cloud replies; the curated label otherwise. Always shown. */
  readonly label: string;
  readonly paragraphs: readonly string[];
  /** Facts from the app's tested code, shown apart from the coach's text. */
  readonly facts: readonly string[];
  /** Extra practice is for thinking, never graded or scored. */
  readonly ungraded: boolean;
  /** Why a cloud request fell back to curated content, if it did. */
  readonly fallbackReason: string | null;
}

export const MAX_COACH_QUESTION = 500;
export const MAX_COACH_REPLY_CHARS = 6000;
