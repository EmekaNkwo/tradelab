import type { Module, Program } from '../../models/content';
import { GOAL_SKILLS, isMatch, matchModule, matchStrategy, rankPrograms, suggestedProgramId, type LearningPreferences } from '../preferenceMatch';

const mod = (id: string, markets: Module['markets'], skills: Module['skills'], level: Module['level'] = 'beginner'): Module => ({
  id,
  title: id,
  summary: '',
  markets,
  level,
  lessonIds: [],
  checkpointQuizId: `${id}-q`,
  practicalResult: '',
  minPracticeDays: 0,
  skills,
});

const prog = (id: string, moduleIds: string[]): Program => ({ id, title: id, summary: '', moduleIds, defaultWeeks: 12 });

const MODULES = new Map<string, Module>([
  ['fx-basics', mod('fx-basics', ['forex'], ['market_fundamentals'])],
  ['fx-risk', mod('fx-risk', ['forex'], ['risk_management'])],
  ['stocks', mod('stocks', ['stocks'], ['market_fundamentals'])],
  ['stock-analysis', mod('stock-analysis', ['stocks'], ['fundamental_analysis'], 'intermediate')],
  ['ta', mod('ta', ['forex', 'stocks'], ['technical_analysis', 'chart_reading'], 'advanced')],
]);
const moduleOf = (id: string) => MODULES.get(id) ?? null;
const PROGRAMS = [prog('forex-path', ['fx-basics', 'fx-risk']), prog('stocks-path', ['stocks', 'stock-analysis', 'ta'])];

const prefs = (p: Partial<LearningPreferences>): LearningPreferences => ({ experience: 'complete_beginner', markets: [], goals: [], ...p });

describe('matchModule', () => {
  it('lists the learner markets and goals the module covers, in the learner order', () => {
    const m = matchModule(MODULES.get('ta')!, prefs({ markets: ['stocks', 'forex', 'futures'], goals: ['chart_practice', 'risk_management', 'technical_analysis'] }));
    expect(m.markets).toEqual(['stocks', 'forex']);
    expect(m.goals).toEqual(['chart_practice', 'technical_analysis']);
    expect(isMatch(m)).toBe(true);
  });

  it('is no match when nothing overlaps', () => {
    const m = matchModule(MODULES.get('fx-basics')!, prefs({ markets: ['futures'], goals: ['quant_backtesting'] }));
    expect(m).toEqual({ markets: [], goals: [] });
    expect(isMatch(m)).toBe(false);
  });

  it('never matches goals that no module skill covers', () => {
    expect(GOAL_SKILLS.famous_traders).toEqual([]);
    expect(matchModule(MODULES.get('fx-basics')!, prefs({ goals: ['famous_traders'] })).goals).toEqual([]);
  });
});

describe('matchStrategy', () => {
  it('matches on markets only', () => {
    expect(matchStrategy({ markets: ['forex', 'stocks'] }, prefs({ markets: ['stocks'], goals: ['technical_analysis'] }))).toEqual({ markets: ['stocks'], goals: [] });
  });
});

describe('rankPrograms / suggestedProgramId', () => {
  it('puts the program whose modules fit the learner markets first', () => {
    const ranked = rankPrograms(PROGRAMS, moduleOf, prefs({ markets: ['stocks'] }));
    expect(ranked.map((r) => r.program.id)).toEqual(['stocks-path', 'forex-path']);
    expect(ranked[0]!.matchedModules).toBe(3);
    expect(ranked[1]!.matchedModules).toBe(0);
    expect(suggestedProgramId(PROGRAMS, moduleOf, prefs({ markets: ['stocks'] }))).toBe('stocks-path');
  });

  it('weighs markets above goals', () => {
    // forex-path matches the market on both modules; stocks-path only matches the goal on one.
    expect(suggestedProgramId(PROGRAMS, moduleOf, prefs({ markets: ['forex'], goals: ['fundamental_analysis'] }))).toBe('forex-path');
  });

  it('breaks ties toward beginner modules for beginners and keeps content order otherwise', () => {
    const tied = [prog('a', ['stock-analysis']), prog('b', ['stocks'])];
    expect(suggestedProgramId(tied, moduleOf, prefs({ markets: ['stocks'] }))).toBe('b');
    expect(suggestedProgramId(tied, moduleOf, prefs({ markets: ['stocks'], experience: 'have_traded' }))).toBe('a');
  });

  it('suggests nothing when no program matches', () => {
    expect(suggestedProgramId(PROGRAMS, moduleOf, prefs({ markets: ['futures'] }))).toBeNull();
  });

  it('skips module ids the content does not have', () => {
    expect(rankPrograms([prog('x', ['missing', 'stocks'])], moduleOf, prefs({ markets: ['stocks'] }))[0]!.matchedModules).toBe(1);
  });
});
