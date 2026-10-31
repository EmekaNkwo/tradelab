import type { MarketKind } from '../../shared/types';
import type { UtcIso } from '../../shared/time';

/**
 * Trading journal (spec §22). Every entry records where it came from, and
 * sources are never mixed in summaries: simulated replay and paper trades,
 * demo trades typed in by hand, and demo trades imported from a MetaTrader
 * statement. Money and prices are decimal strings.
 */

export const JOURNAL_SOURCES = ['replay', 'paper', 'manual', 'mt_import'] as const;
export type JournalSource = (typeof JOURNAL_SOURCES)[number];

/** Sources whose dates come from generated charts, not the calendar. */
export const SIMULATED_SOURCES: readonly JournalSource[] = ['replay', 'paper'];
/** Sources where risk rules were checked (by the app, or by the learner when entering by hand). */
export const RULE_CHECKED_SOURCES: readonly JournalSource[] = ['paper', 'manual'];

/** When the learner actually did the trade: simulated trades use when they were logged, since their chart dates are made up. */
export function activityDate(e: { readonly source: JournalSource; readonly closedAt: string | null; readonly createdAt: string }): string {
  return SIMULATED_SOURCES.includes(e.source) ? e.createdAt : (e.closedAt ?? e.createdAt);
}

export const JOURNAL_SOURCE_LABELS: Readonly<Record<JournalSource, string>> = {
  replay: 'Replay (simulated)',
  paper: 'Paper trading (simulated)',
  manual: 'Demo trade, entered by hand',
  mt_import: 'Imported from MT statement',
};

/** Self-ratings from 1 (low) to 5 (high). A learning aid, not a mental-health assessment. */
export interface EmotionRatings {
  readonly confidence: number;
  readonly stress: number;
  readonly patience: number;
  /** One word or phrase, e.g. "calm", "rushed". */
  readonly feeling: string | null;
}

/** The review flow (spec §22): thesis → plan vs. actual → rules → result → one lesson → next goal. */
export interface JournalReview {
  readonly thesis: string;
  readonly planVsActual: string;
  readonly rulesFollowed: boolean;
  /** The result in words, kept apart from whether the decision was good. */
  readonly resultNote: string;
  readonly lesson: string;
  readonly nextGoal: string;
  readonly reviewedAt: UtcIso;
}

export interface JournalEntry {
  readonly id: string;
  readonly source: JournalSource;
  /** Paper account, replay attempt, or import batch this came from. */
  readonly sourceRef: string | null;
  /** Stable id from the source, used to skip duplicates (e.g. "mt4:12345"). */
  readonly externalId: string | null;
  readonly market: MarketKind | null;
  readonly instrument: string;
  readonly direction: 'buy' | 'sell';
  readonly strategy: string | null;
  readonly entry: string;
  readonly stop: string | null;
  readonly target: string | null;
  readonly size: string;
  readonly sizeUnit: string;
  readonly exit: string | null;
  readonly pnlMoney: string | null;
  readonly pnlPips: string | null;
  /** Result in multiples of the planned risk; null without a planned risk. */
  readonly pnlR: string | null;
  readonly plannedRisk: string | null;
  /** Commission, swap and other costs; negative is a cost. */
  readonly costs: string | null;
  /** Account equity when the trade was placed, to judge risk as a share of it. */
  readonly equityAtEntry: string | null;
  readonly openedAt: string | null;
  readonly closedAt: string | null;
  readonly conditions: string | null;
  readonly entryRationale: string | null;
  readonly exitRationale: string | null;
  readonly emotion: EmotionRatings | null;
  /** Risk rule ids broken on this trade. */
  readonly ruleViolations: readonly string[];
  readonly noteBefore: string | null;
  readonly noteAfter: string | null;
  /** Local file URI of a chart screenshot, if the learner attached one. Not included in backups. */
  readonly screenshotUri: string | null;
  readonly review: JournalReview | null;
  readonly processScore: number | null;
  readonly createdAt: UtcIso;
  readonly updatedAt: UtcIso;
}

/** Psychology Lab answer (spec §21). */
export interface PsychAttempt {
  readonly id: string;
  readonly scenarioId: string;
  readonly responseId: string;
  readonly quality: 'helpful' | 'mixed' | 'harmful';
  readonly answeredAt: UtcIso;
}
