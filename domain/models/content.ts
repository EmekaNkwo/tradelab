import type { ExplanationLevel, MarketKind } from '../../shared/types';
import type { SkillId } from './progress';

/**
 * Content models (spec §9). Content lives in versioned JSON under `content/`
 * and is validated at the data boundary before reaching these types.
 * Progress keys use these stable IDs so content updates never lose progress.
 */

export type ContentLevel = 'beginner' | 'intermediate' | 'advanced';

/** Text with one variant per explanation level; `simple` is always required. */
export interface LevelledText {
  readonly simple: string;
  readonly balanced?: string;
  readonly advanced?: string;
}

export interface GlossaryEntry {
  readonly id: string;
  readonly term: string;
  readonly aliases: readonly string[];
  readonly definition: LevelledText;
  readonly example?: string;
  readonly related: readonly string[];
  readonly markets: readonly MarketKind[];
  readonly level: ContentLevel;
  readonly sourceIds: readonly string[];
}

export type DisclosureTrigger = 'first_launch' | 'futures' | 'penny_stocks' | 'leverage' | 'final_module' | 'always';

/**
 * A statistic may only appear with full provenance (spec §3 rule 2).
 * It is never generalised beyond `productsCovered`.
 */
export interface DisclosureStatistic {
  readonly id: string;
  readonly statement: string;
  readonly sourceId: string;
  readonly jurisdiction: string;
  readonly provider: string;
  readonly publishedOn: string;
  readonly verifiedOn: string;
  readonly productsCovered: string;
}

export interface Disclosure {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly body: readonly string[];
  readonly triggers: readonly DisclosureTrigger[];
  readonly statistics: readonly DisclosureStatistic[];
}

export type SourceType = 'book' | 'interview' | 'article' | 'academic' | 'regulator' | 'dataset' | 'website' | 'other';
export type SourceQuality = 'primary' | 'strong_secondary' | 'limited_or_disputed';

/** Research Library source record (spec §26). */
export interface Source {
  readonly id: string;
  readonly title: string;
  readonly author: string | null;
  readonly publisher: string | null;
  readonly url: string | null;
  readonly publishedOn: string | null;
  readonly type: SourceType;
  readonly quality: SourceQuality;
  readonly claimsSupported: readonly string[];
  readonly limitations: string;
  readonly lastVerifiedOn: string;
  /** Spec §15.1: trader/strategy sources must be human-reviewed before release. */
  readonly humanReviewed: boolean;
  /** Who reviewed it and when; required when `humanReviewed` is true. */
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
  readonly relatedStrategyIds: readonly string[];
  readonly relatedTraderIds: readonly string[];
  /** Where this source disagrees with another one (spec §26 "show disagreements"). */
  readonly disagreements: readonly SourceDisagreement[];
}

export interface SourceDisagreement {
  readonly sourceId: string;
  readonly note: string;
}

export interface QuestionOption {
  readonly id: string;
  readonly text: string;
  /** Why this option is right or wrong — feedback, not just a verdict. */
  readonly explanation: string;
}

export interface Question {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly QuestionOption[];
  readonly correctOptionIds: readonly string[];
  readonly level: ContentLevel;
  readonly glossaryIds: readonly string[];
  /** Overrides the lesson's or module's skills for this question (spec §23). */
  readonly skills?: readonly SkillId[];
}

export interface Quiz {
  readonly id: string;
  readonly title: string;
  readonly passMark: number;
  readonly questions: readonly Question[];
}

/** A worked example with every assumption stated (spec §9.1 "Real numbers"). */
export interface WorkedExample {
  readonly assumptions: readonly string[];
  readonly steps: readonly string[];
}

/** Lesson pattern (spec §9.1). */
export interface Lesson {
  readonly id: string;
  readonly moduleId: string;
  readonly title: string;
  readonly level: ContentLevel;
  readonly estimatedMinutes: number;
  readonly inOneLine: LevelledText;
  readonly explain: LevelledText;
  readonly realNumbers: WorkedExample;
  /** "Show another example" (spec §7.2). */
  readonly anotherExample: WorkedExample;
  /** "Explain more simply": a plainer restatement, shorter than `explain.simple`. */
  readonly explainSimpler: string;
  readonly commonMistake: string;
  readonly quickCheck: readonly Question[];
  readonly doItNow: {
    readonly kind: PracticeKind;
    readonly instructions: string;
    /** A guided MetaTrader task for this practice (spec §14.3). */
    readonly mtTaskId?: string;
  };
  readonly homework?: string;
  readonly glossaryIds: readonly string[];
  readonly sourceIds: readonly string[];
  /** Overrides the module's skills for this lesson and its questions (spec §23). */
  readonly skills?: readonly SkillId[];
}

export type PracticeKind = 'chart_lab' | 'replay' | 'paper' | 'backtest' | 'fundamental' | 'metatrader' | 'calculator' | 'reflection';

/** One step of a guided MetaTrader task; MT4 and MT5 wording only where they differ. */
export interface MetaTraderStep {
  readonly text: string;
  readonly mt4?: string;
  readonly mt5?: string;
}

/**
 * A guided MetaTrader practice task (spec §14). The app cannot see inside
 * MetaTrader, so completion is the learner's own confirmation, recorded as such.
 */
export interface MetaTraderTask {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly level: ContentLevel;
  /** Order exercises require "I'm on a demo account" first (spec §14.2). */
  readonly requiresDemo: boolean;
  readonly steps: readonly MetaTraderStep[];
  /** 1–2 questions about what the learner saw. */
  readonly afterQuestions: readonly Question[];
  readonly glossaryIds: readonly string[];
}

export interface Module {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly markets: readonly MarketKind[];
  readonly level: ContentLevel;
  readonly lessonIds: readonly string[];
  readonly checkpointQuizId: string;
  readonly practicalResult: string;
  /** Practice modules keep minimum real days in the schedule (spec §6.2). */
  readonly minPracticeDays: number;
  /** Skills its lessons and checkpoint give evidence for (spec §23). */
  readonly skills: readonly SkillId[];
  /**
   * Traders the module is about (spec §15.4). A module with traders ships only
   * when every one of them has passed human review (spec §15.1).
   */
  readonly traderIds?: readonly string[];
}

export interface Program {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly moduleIds: readonly string[];
  readonly defaultWeeks: number;
}

export function pickLevelledText(text: LevelledText, level: ExplanationLevel): string {
  if (level === 'advanced') return text.advanced ?? text.balanced ?? text.simple;
  if (level === 'balanced') return text.balanced ?? text.simple;
  return text.simple;
}

/** Thinking traps covered by the Trading Psychology Lab (spec §21). */
export const PSYCH_TOPICS = [
  'fomo',
  'revenge-trading',
  'overtrading',
  'fear-of-losses',
  'greed',
  'overconfidence',
  'confirmation',
  'loss-aversion',
  'recency',
  'sunk-cost',
  'impulsive-entries',
  'moving-stops',
  'sizing-up-after-losses',
  'quitting-after-normal-losing-streak',
] as const;
export type PsychTopic = (typeof PSYCH_TOPICS)[number];

/** How a response in a psychology scenario serves the learner's process. */
export type ResponseQuality = 'helpful' | 'mixed' | 'harmful';

export interface PsychResponse {
  readonly id: string;
  readonly text: string;
  readonly quality: ResponseQuality;
  /** Why this response helps or hurts, in plain words. */
  readonly explanation: string;
}

/**
 * A practice scenario about a thinking trap (spec §21). Educational only:
 * never a mental-health assessment.
 */
export interface PsychScenario {
  readonly id: string;
  readonly topic: PsychTopic;
  readonly title: string;
  /** The situation, told in the second person ("You have lost three trades today…"). */
  readonly situation: string;
  readonly question: string;
  readonly responses: readonly PsychResponse[];
  /** One idea to take away. */
  readonly takeaway: string;
  readonly glossaryIds: readonly string[];
}
