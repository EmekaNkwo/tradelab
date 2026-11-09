import { useCallback, useMemo } from 'react';
import { isMatch, matchModule, matchStrategy, suggestedProgramId, type LearningPreferences, type PreferenceMatch } from '../../domain/learning';
import type { Module } from '../../domain/models/content';
import type { ExperienceLevel, LearningGoal, UserProfile } from '../../domain/models/learner';
import { notFound, validationError, type AppError } from '../../shared/errors';
import { err, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { STUDY_MARKETS, type StudyMarket } from '../../shared/types';
import type { Container } from '../app';
import { useContainer } from '../app';
import { useProfile } from './hooks';

export type { LearningPreferences, PreferenceMatch } from '../../domain/learning';
export { isMatch as isPreferenceMatch } from '../../domain/learning';

export const EXPERIENCE_CHOICES: readonly { readonly value: ExperienceLevel; readonly label: string }[] = [
  { value: 'complete_beginner', label: 'Complete beginner' },
  { value: 'know_basic_terms', label: 'I know basic terms' },
  { value: 'used_simulated_trading', label: 'I have used simulated trading' },
  { value: 'have_traded', label: 'I have traded before' },
  { value: 'quant_research', label: 'Interested in quantitative research' },
];

export const MARKET_CHOICES: readonly { readonly value: StudyMarket; readonly label: string }[] = [
  { value: 'forex', label: 'Forex' },
  { value: 'stocks', label: 'Ordinary stocks' },
  { value: 'penny_stocks', label: 'Penny stocks' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'futures', label: 'Futures' },
  { value: 'options', label: 'Options' },
];

export const GOAL_CHOICES: readonly { readonly value: LearningGoal; readonly label: string }[] = [
  { value: 'understand_markets', label: 'Understand markets' },
  { value: 'technical_analysis', label: 'Technical analysis' },
  { value: 'fundamental_analysis', label: 'Fundamental analysis' },
  { value: 'famous_traders', label: 'Study famous traders' },
  { value: 'develop_strategies', label: 'Develop strategies' },
  { value: 'risk_management', label: 'Risk management' },
  { value: 'chart_practice', label: 'Chart practice' },
  { value: 'quant_backtesting', label: 'Quantitative backtesting' },
  { value: 'long_term_investing', label: 'Long-term investing' },
];

const labelOf = <T extends string>(choices: readonly { readonly value: T; readonly label: string }[], value: T): string =>
  choices.find((c) => c.value === value)?.label ?? value;

/** "Matches your choices: Forex, Risk management", or null when nothing matches. */
export function describeMatch(match: PreferenceMatch): string | null {
  if (!isMatch(match)) return null;
  const parts = [...match.markets.map((m) => labelOf(MARKET_CHOICES, m)), ...match.goals.map((g) => labelOf(GOAL_CHOICES, g))];
  return `Matches your choices: ${parts.join(', ')}`;
}

type Deps = Pick<Container, 'clock' | 'profile'>;

/**
 * Saves new learning preferences on the existing profile. Only experience, markets and goals change: the program,
 * schedule and progress stay exactly as they are.
 */
export async function updateLearningPreferences(deps: Deps, prefs: LearningPreferences): Promise<Result<UserProfile, AppError>> {
  if (prefs.markets.length === 0) return err(validationError('Choose at least one market'));
  if (prefs.goals.length === 0) return err(validationError('Choose at least one thing to learn'));
  if (prefs.markets.some((m) => !STUDY_MARKETS.includes(m))) return err(validationError('Unknown market'));
  if (prefs.goals.some((g) => !GOAL_CHOICES.some((c) => c.value === g))) return err(validationError('Unknown goal'));
  if (!EXPERIENCE_CHOICES.some((c) => c.value === prefs.experience)) return err(validationError('Unknown experience level'));
  const existing = await deps.profile.get();
  if (!existing.ok) return existing;
  if (!existing.value) return err(notFound('Finish setting up TradeLab first'));
  return deps.profile.save({
    ...existing.value,
    experience: prefs.experience,
    markets: [...prefs.markets],
    goals: [...prefs.goals],
    updatedAt: toUtcIso(deps.clock.now()),
  });
}

export function useUpdateLearningPreferences() {
  const c = useContainer();
  return useCallback((prefs: LearningPreferences) => updateLearningPreferences(c, prefs), [c]);
}

export interface PreferenceMatcher {
  /** The learner's saved preferences, or null before onboarding (nothing is marked then). */
  readonly prefs: LearningPreferences | null;
  readonly forModule: (module: Pick<Module, 'markets' | 'skills'>) => PreferenceMatch | null;
  /** Same as forModule, by id; null for an unknown module. */
  readonly forModuleId: (moduleId: string) => PreferenceMatch | null;
  readonly forStrategy: (strategy: { readonly markets: readonly StudyMarket[] }) => PreferenceMatch | null;
  /** The best-fit program for these preferences, or null. */
  readonly suggestedProgramId: string | null;
}

/** Matches content against the saved preferences, live: it updates as soon as the learner changes them. */
export function usePreferenceMatcher(): PreferenceMatcher {
  const c = useContainer();
  const profile = useProfile();
  const p = profile.status === 'success' ? profile.data : null;
  return useMemo(() => {
    const prefs: LearningPreferences | null = p ? { experience: p.experience, markets: p.markets, goals: p.goals } : null;
    return {
      prefs,
      forModule: (m) => (prefs ? matchModule(m, prefs) : null),
      forModuleId: (id) => {
        const m = c.content.module(id);
        return prefs && m ? matchModule(m, prefs) : null;
      },
      forStrategy: (s) => (prefs ? matchStrategy(s, prefs) : null),
      suggestedProgramId: prefs ? suggestedProgramId(c.content.programs(), (id) => c.content.module(id), prefs) : null,
    };
  }, [c.content, p]);
}
