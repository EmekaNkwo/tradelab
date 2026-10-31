import type { RiskRules } from '../risk/rules';
import type { ExplanationLevel, MarketKind, ThemePreference } from '../../shared/types';
import type { UtcIso } from '../../shared/time';

export type ExperienceLevel =
  | 'complete_beginner'
  | 'know_basic_terms'
  | 'used_simulated_trading'
  | 'have_traded'
  | 'quant_research';

export type LearningGoal =
  | 'understand_markets'
  | 'technical_analysis'
  | 'fundamental_analysis'
  | 'famous_traders'
  | 'develop_strategies'
  | 'risk_management'
  | 'chart_practice'
  | 'quant_backtesting'
  | 'long_term_investing';

export type MetaTraderVersion = 'mt4' | 'mt5';

export interface UserProfile {
  readonly id: string;
  readonly experience: ExperienceLevel;
  readonly markets: readonly MarketKind[];
  readonly goals: readonly LearningGoal[];
  readonly explanationLevel: ExplanationLevel;
  readonly metaTrader: { readonly version: MetaTraderVersion; readonly installed: boolean } | null;
  readonly timeZone: string;
  /** When the learner accepted the "simulation and demo only" agreement. */
  readonly riskAcknowledgedAt: UtcIso | null;
  readonly createdAt: UtcIso;
  readonly updatedAt: UtcIso;
}

export interface AppSettings {
  readonly theme: ThemePreference;
  readonly explanationLevel: ExplanationLevel;
  readonly timeZone: string;
  readonly lastBackupAt: UtcIso | null;
  /** The learner's own risk rules (spec §19); the defaults are learning examples. */
  readonly riskRules: RiskRules;
  /** Ask the pre-trade checklist before placing a paper trade (spec §20, §32A.5). */
  readonly preTradeChecklist: boolean;
  /** Show the study streak on Progress (spec §29). Optional, with rest days. */
  readonly streaks: boolean;
  /** Extra learning reminders (spec §29); they only fire while class reminders are on. */
  readonly reminders: LearningReminderSettings;
  /** Optional online services and the AI coach (spec §24, §30). Everything is off until the learner turns it on. */
  readonly integrations: IntegrationSettings;
  /** An ongoing notification with the current MetaTrader task step (spec §11). Off until the learner turns it on. */
  readonly mtStepNotification: boolean;
}

export interface LearningReminderSettings {
  /** On rest days at class time, when earlier answers are due for another look. */
  readonly weakReview: boolean;
  /** Sunday at class time: look at the week's progress. */
  readonly weeklySummary: boolean;
  /** Weekly while no backup has been made in the last 30 days. */
  readonly backup: boolean;
}

export type CoachMode = 'off' | 'curated' | 'cloud';
export type CloudCoachModel = 'claude-opus-5-5' | 'claude-haiku-5-5';

/** What the learner agreed may be sent to the cloud coach (spec §24.2: journal and strategy data only with consent). */
export interface CoachConsent {
  /** Journal entries and their notes, when asking for a journal or trade review. */
  readonly journal: boolean;
  /** Saved strategies and their rules. */
  readonly strategies: boolean;
  /** Backtest reports (metrics and warnings; never the price data). */
  readonly backtests: boolean;
}

export interface IntegrationSettings {
  /** Fetch historical candles from the optional provider with the learner's own key. Needs the internet. */
  readonly marketProvider: boolean;
  /** Off; curated (offline explanations from the app's own content); or cloud (the learner's own Anthropic key, with curated as the fallback). */
  readonly coach: CoachMode;
  readonly cloudModel: CloudCoachModel;
  readonly coachConsent: CoachConsent;
}
