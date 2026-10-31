import { priceChannel } from '../../market/indicators';
import type { Strategy } from '../../models/strategies';
import { activeFilterCount, exercisesOf, NO_FILTERS, searchLibrary } from '../library';
import { encodeAnswers, exerciseOptions, strategyCompletion } from '../progress';

const question = { id: 'q', prompt: 'P', options: [], correctOptionIds: ['a'], level: 'beginner', glossaryIds: [] } as const;

const make = (over: Partial<Strategy> & Pick<Strategy, 'id' | 'title'>): Strategy => ({
  category: 'trading',
  family: 'trend_following',
  markets: ['forex'],
  level: 'beginner',
  horizon: 'swing',
  style: 'rules_based',
  analysis: 'technical',
  attribution: 'generic',
  traderIds: [],
  overview: { objective: 'Objective', holdingPeriod: 'Weeks', context: 'Daily charts' },
  evidence: null,
  simple: { simple: 'Plain text.' },
  reasoning: 'R',
  rules: null,
  demo: null,
  replay: null,
  exercise: null,
  failureAnalysis: ['F'],
  limitations: ['L'],
  knowledgeCheck: [question],
  lessonIds: [],
  glossaryIds: [],
  skills: ['strategy_understanding'],
  sourceIds: [],
  review: null,
  ...over,
});

const EXERCISE = {
  prompt: 'Pick',
  situation: 'S',
  options: [
    { id: 'a', text: 'A', correct: true, explanation: 'E' },
    { id: 'b', text: 'B', correct: false, explanation: 'E' },
  ],
};

const trend = make({ id: 'trend', title: 'Trend following', simple: { simple: 'Follow the [[moving-average|average]] line.' }, demo: { scenario: 'strong_uptrend', overlays: [], pane: 'none', lookFor: 'x' }, exercise: EXERCISE });
const value = make({ id: 'value', title: 'Value investing', category: 'investing', family: 'value', markets: ['stocks'], style: 'discretionary', analysis: 'fundamental', horizon: 'long_term' });
const sizing = make({ id: 'sizing', title: 'Position sizing', category: 'risk_principle', family: 'risk_management', markets: ['forex', 'stocks'] });
const named = make({ id: 'named', title: 'A named method', attribution: 'documented', traderIds: ['t1'], replay: { scenario: 'breakout', instructions: 'x' } });
const ALL = [value, sizing, named, trend];
const ids = (groups: ReturnType<typeof searchLibrary>) => groups.map((g) => `${g.category}:${g.strategies.map((s) => s.id).join(',')}`);

describe('priceChannel', () => {
  it('uses the previous candles only and is empty until enough exist', () => {
    const candles = [
      { high: 5, low: 1 },
      { high: 7, low: 2 },
      { high: 6, low: 3 },
      { high: 9, low: 4 },
    ];
    expect(priceChannel(candles, 2)).toEqual({ upper: [null, null, 7, 7], lower: [null, null, 1, 2] });
    expect(() => priceChannel(candles, 0)).toThrow();
  });
});

describe('strategy library search', () => {
  it('groups by category in a fixed order, sorted by title', () => {
    expect(ids(searchLibrary(ALL, '', NO_FILTERS))).toEqual(['trading:named,trend', 'investing:value', 'risk_principle:sizing']);
  });

  it('matches every word of the query, ignoring case and glossary link syntax, including trader names', () => {
    expect(ids(searchLibrary(ALL, 'AVERAGE trend', NO_FILTERS))).toEqual(['trading:trend']);
    expect(ids(searchLibrary(ALL, 'moving-average', NO_FILTERS))).toEqual([]);
    expect(ids(searchLibrary(ALL, 'fixture person', NO_FILTERS, (id) => (id === 't1' ? 'Fixture Person' : null)))).toEqual(['trading:named']);
    expect(searchLibrary(ALL, 'nothing like this', NO_FILTERS)).toEqual([]);
  });

  it('filters within a dimension by any-of and across dimensions by all-of', () => {
    expect(ids(searchLibrary(ALL, '', { ...NO_FILTERS, markets: ['stocks'] }))).toEqual(['investing:value', 'risk_principle:sizing']);
    expect(ids(searchLibrary(ALL, '', { ...NO_FILTERS, markets: ['stocks'], styles: ['rules_based'] }))).toEqual(['risk_principle:sizing']);
    expect(ids(searchLibrary(ALL, '', { ...NO_FILTERS, traders: ['with_trader'] }))).toEqual(['trading:named']);
    expect(ids(searchLibrary(ALL, '', { ...NO_FILTERS, exercises: ['chart_demo', 'replay'] }))).toEqual(['trading:named,trend']);
    expect(ids(searchLibrary(ALL, '', { ...NO_FILTERS, analysis: ['fundamental'], horizons: ['long_term'] }))).toEqual(['investing:value']);
    expect(activeFilterCount({ ...NO_FILTERS, markets: ['stocks', 'forex'], levels: ['beginner'] })).toBe(3);
  });

  it('lists the exercises a page offers', () => {
    expect(exercisesOf(trend)).toEqual(['chart_demo', 'guided_exercise', 'knowledge_check']);
    expect(exercisesOf(named)).toEqual(['replay', 'knowledge_check']);
  });
});

describe('strategy completion', () => {
  it('needs the knowledge check and, when present, the guided exercise at 80% or more', () => {
    expect(strategyCompletion(trend, []).criteria.map((c) => [c.id, c.met, c.best])).toEqual([
      ['knowledge_check', false, null],
      ['guided_exercise', false, null],
    ]);
    const some = strategyCompletion(trend, [
      { kind: 'strategy_check', refId: 'trend', score: 0.67 },
      { kind: 'strategy_check', refId: 'trend', score: 1 },
      { kind: 'strategy_exercise', refId: 'trend', score: 0.6 },
      { kind: 'strategy_exercise', refId: 'other', score: 1 },
    ]);
    expect(some.criteria.map((c) => [c.met, c.best])).toEqual([
      [true, 1],
      [false, 0.6],
    ]);
    expect(some.complete).toBe(false);
    expect(strategyCompletion(trend, [
      { kind: 'strategy_check', refId: 'trend', score: 0.8 },
      { kind: 'strategy_exercise', refId: 'trend', score: 0.8 },
    ]).complete).toBe(true);
    expect(strategyCompletion(value, [{ kind: 'strategy_check', refId: 'value', score: 0.8 }]).complete).toBe(true);
  });

  it('maps exercise options and encodes answers', () => {
    expect(exerciseOptions(trend)).toEqual([
      { id: 'a', expected: true },
      { id: 'b', expected: false },
    ]);
    expect(exerciseOptions(value)).toEqual([]);
    expect(encodeAnswers({ q1: ['a'], q2: ['b', 'c'] })).toEqual(['q1=a', 'q2=b', 'q2=c']);
  });
});
