import type { SkillId } from '../models/progress';

/**
 * Which skills each kind of practice gives evidence for (spec §23). Drills and
 * simulators are code, not content, so their tags live here; content items
 * (modules, lessons, questions, lab concepts, strategies) carry their own.
 */
export const DRILL_SKILLS: Readonly<Record<string, readonly SkillId[]>> = {
  find_the_trend: ['chart_reading'],
  breakout_or_fake: ['chart_reading', 'technical_analysis'],
  where_is_the_stop: ['risk_management', 'chart_reading'],
  size_it: ['risk_management'],
};

export const LAB_SKILLS: Readonly<Record<'red_flag' | 'scenario', readonly SkillId[]>> = {
  red_flag: ['fundamental_analysis', 'risk_management'],
  scenario: ['fundamental_analysis'],
};

/** Replay is scored on process: a stop from the start and risk within the limit. */
export const REPLAY_SKILLS: readonly SkillId[] = ['execution_discipline', 'risk_management'];

/** Psychology lab answers judge how helpful a response to a situation is. */
export const PSYCH_SKILLS: readonly SkillId[] = ['psychology'];

export const PSYCH_QUALITY_SCORE = { helpful: 1, mixed: 0.5, harmful: 0 } as const;

/** Skills worth practising in Replay, with the scenario to open when no lab concept names one. */
export const REPLAY_PRACTICE: Readonly<Partial<Record<SkillId, string>>> = {
  chart_reading: 'strong_uptrend',
  technical_analysis: 'breakout',
  execution_discipline: 'range',
  risk_management: 'high_volatility',
};
