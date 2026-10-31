/**
 * Skills, challenges and awards (spec §23, §27, §29).
 *
 * Process over profit (spec §3.4): nothing here is ever derived from simulated
 * profit, size or leverage, and nothing rewards placing more trades. Records that feed progress carry no
 * such fields at all (see `domain/progress/records.ts`).
 */

/** The ten skills the adaptive engine tracks (spec §23). */
export const SKILL_IDS = [
  'market_fundamentals',
  'chart_reading',
  'technical_analysis',
  'fundamental_analysis',
  'risk_management',
  'strategy_understanding',
  'execution_discipline',
  'psychology',
  'backtesting_literacy',
  'statistical_reasoning',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export const SKILL_LABELS: Readonly<Record<SkillId, string>> = {
  market_fundamentals: 'Market fundamentals',
  chart_reading: 'Chart reading',
  technical_analysis: 'Technical analysis',
  fundamental_analysis: 'Fundamental analysis',
  risk_management: 'Risk management',
  strategy_understanding: 'Strategy understanding',
  execution_discipline: 'Execution discipline',
  psychology: 'Trading psychology',
  backtesting_literacy: 'Backtesting literacy',
  statistical_reasoning: 'Statistical reasoning',
};

/** Challenge families (spec §27). */
export const CHALLENGE_TYPES = [
  'beginner_market',
  'risk_management',
  'chart_reading',
  'replay',
  'strategy_research',
  'backtesting',
  'famous_trader',
  'forex_metatrader',
  'fundamental_analysis',
] as const;

export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

/** What a criterion assesses (spec §27); simulated profit is never one of them. */
export const CHALLENGE_DIMENSIONS = ['understanding', 'risk_control', 'consistency', 'reasoning', 'rule_use', 'uncertainty'] as const;

export type ChallengeDimension = (typeof CHALLENGE_DIMENSIONS)[number];

export const CHALLENGE_DIMENSION_LABELS: Readonly<Record<ChallengeDimension, string>> = {
  understanding: 'Understanding',
  risk_control: 'Risk control',
  consistency: 'Consistency',
  reasoning: 'Reasoning',
  rule_use: 'Correct rule use',
  uncertainty: 'Awareness of uncertainty',
};

/** One measurable requirement, checked against the learner's real records. */
export type ChallengeRequirement =
  /** A module checkpoint passed. */
  /**
   * Met by passing `moduleId`'s checkpoint or any in `orModuleIds`: the same
   * idea in each program, so a challenge never needs a program the learner is
   * not following.
   */
  | { readonly kind: 'checkpoint_passed'; readonly moduleId: string; readonly orModuleIds?: readonly string[] }
  /** The latest answers to `count` questions on a skill, at `accuracy` or better. */
  | { readonly kind: 'skill_questions'; readonly skill: SkillId; readonly count: number; readonly accuracy: number }
  /** The last `count` attempts at a drill, at `accuracy` or better. */
  | { readonly kind: 'drill'; readonly drillKind: string; readonly count: number; readonly accuracy: number }
  /** The last `count` rule-checked trades: no rule broken and a stop set. */
  | { readonly kind: 'clean_trades'; readonly count: number }
  /** Journal reviews written for `count` rule-checked trades. */
  | { readonly kind: 'reviewed_trades'; readonly count: number }
  /** Finished replays with a process score of at least `minProcessScore`, across `conditions` different market conditions. */
  | { readonly kind: 'replays'; readonly count: number; readonly minProcessScore: number; readonly conditions: number }
  /** Lab cases of a kind judged at `minScore` or better (best attempt per case). */
  | { readonly kind: 'lab_cases'; readonly labKind: 'red_flag' | 'scenario'; readonly count: number; readonly minScore: number }
  /** Strategy pages completed (knowledge check and exercise passed). */
  | { readonly kind: 'strategies_completed'; readonly count: number }
  /** Saved backtests that kept an out-of-sample part or period blocks. */
  | { readonly kind: 'backtests_tested_out_of_sample'; readonly count: number }
  /** Guided MetaTrader tasks confirmed done. */
  | { readonly kind: 'mt_tasks'; readonly taskIds: readonly string[] }
  /** Reviewed famous-trader strategy pages completed (spec §15.1: only reviewed content counts). */
  | { readonly kind: 'traders_studied'; readonly count: number };

export type ChallengeRequirementKind = ChallengeRequirement['kind'];

export type ChallengeCriterion = ChallengeRequirement & {
  readonly label: string;
  readonly dimension: ChallengeDimension;
};

export interface Challenge {
  readonly id: string;
  readonly type: ChallengeType;
  readonly title: string;
  readonly summary: string;
  readonly skills: readonly SkillId[];
  readonly criteria: readonly ChallengeCriterion[];
  /** Traders the challenge depends on; it ships only when they pass review (spec §15.1). */
  readonly traderIds?: readonly string[];
}
