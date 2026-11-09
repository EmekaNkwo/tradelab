import type { Module, Program } from '../models/content';
import type { ExperienceLevel, LearningGoal } from '../models/learner';
import type { SkillId } from '../models/progress';
import type { StudyMarket } from '../../shared/types';

/** What the learner said they want to learn (onboarding, or Settings → What I want to learn). */
export interface LearningPreferences {
  readonly experience: ExperienceLevel;
  readonly markets: readonly StudyMarket[];
  readonly goals: readonly LearningGoal[];
}

/** Which of the learner's own choices an item covers, in the learner's order. */
export interface PreferenceMatch {
  readonly markets: readonly StudyMarket[];
  readonly goals: readonly LearningGoal[];
}

/**
 * The module skills that serve each goal. Goals with no skill (famous traders, long-term investing) are served by
 * other screens, so they never mark a module as a match.
 */
export const GOAL_SKILLS: Readonly<Record<LearningGoal, readonly SkillId[]>> = {
  understand_markets: ['market_fundamentals'],
  technical_analysis: ['technical_analysis'],
  fundamental_analysis: ['fundamental_analysis'],
  famous_traders: [],
  develop_strategies: ['strategy_understanding'],
  risk_management: ['risk_management'],
  chart_practice: ['chart_reading'],
  quant_backtesting: ['backtesting_literacy', 'statistical_reasoning'],
  long_term_investing: [],
};

const BEGINNER_EXPERIENCE: ReadonlySet<ExperienceLevel> = new Set(['complete_beginner', 'know_basic_terms']);
/** A module on one of the learner's markets counts for more than one on a goal: markets decide what is relevant at all. */
const MARKET_WEIGHT = 2;
const GOAL_WEIGHT = 1;

export function matchModule(module: Pick<Module, 'markets' | 'skills'>, prefs: LearningPreferences): PreferenceMatch {
  return {
    markets: prefs.markets.filter((m) => module.markets.includes(m)),
    goals: prefs.goals.filter((g) => GOAL_SKILLS[g].some((s) => module.skills.includes(s))),
  };
}

export function matchStrategy(strategy: { readonly markets: readonly StudyMarket[] }, prefs: LearningPreferences): PreferenceMatch {
  return { markets: prefs.markets.filter((m) => strategy.markets.includes(m)), goals: [] };
}

export function isMatch(match: PreferenceMatch): boolean {
  return match.markets.length > 0 || match.goals.length > 0;
}

export interface RankedProgram {
  readonly program: Program;
  readonly score: number;
  /** Modules that cover at least one of the learner's markets or goals. */
  readonly matchedModules: number;
  /** Share of the program's modules at beginner level, 0–1. */
  readonly beginnerShare: number;
}

function rankOne(program: Program, moduleOf: (id: string) => Module | null, prefs: LearningPreferences): RankedProgram {
  const modules = program.moduleIds.flatMap((id) => moduleOf(id) ?? []);
  const matches = modules.map((m) => matchModule(m, prefs));
  const score = matches.reduce((sum, m) => sum + (m.markets.length > 0 ? MARKET_WEIGHT : 0) + (m.goals.length > 0 ? GOAL_WEIGHT : 0), 0);
  const beginnerShare = modules.length === 0 ? 0 : modules.filter((m) => m.level === 'beginner').length / modules.length;
  return { program, score, matchedModules: matches.filter(isMatch).length, beginnerShare };
}

/** Programs best fit first. Ties go to the gentler program for beginners; otherwise content order is kept. */
export function rankPrograms(programs: readonly Program[], moduleOf: (id: string) => Module | null, prefs: LearningPreferences): readonly RankedProgram[] {
  const beginner = BEGINNER_EXPERIENCE.has(prefs.experience);
  return programs
    .map((p, index) => ({ ranked: rankOne(p, moduleOf, prefs), index }))
    .sort((a, b) => b.ranked.score - a.ranked.score || (beginner ? b.ranked.beginnerShare - a.ranked.beginnerShare : 0) || a.index - b.index)
    .map((x) => x.ranked);
}

/** The best-fit program, or null when none covers anything the learner chose. */
export function suggestedProgramId(programs: readonly Program[], moduleOf: (id: string) => Module | null, prefs: LearningPreferences): string | null {
  const best = rankPrograms(programs, moduleOf, prefs)[0];
  return best && best.score > 0 ? best.program.id : null;
}
