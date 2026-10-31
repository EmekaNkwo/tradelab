import type { ProgressReview } from '../../../domain/review';
import { areaVerdicts } from '../reviewVerdicts';

const objective = (moduleId: string, checkpoint: 'passed' | 'attempted' | 'not_attempted') => ({ moduleId, title: moduleId, practicalResult: '', checkpoint, bestScore: null, practicalDone: null });

const REVIEW: ProgressReview = {
  objectives: [objective('a', 'passed'), objective('b', 'attempted'), objective('c', 'not_attempted')],
  calculations: [
    { id: 'x', label: 'X', answered: 2, correct: 1, accuracy: 0.5 },
    { id: 'y', label: 'Y', answered: 1, correct: 1, accuracy: 1 },
    { id: 'z', label: 'Z', answered: 0, correct: 0, accuracy: null },
  ],
  rules: { checkedTrades: 4, withoutBreaks: 3, withStop: 4, reviewed: 2, commonBreaks: [] },
  conditions: [
    { id: 'trending', label: 'Trending', sessions: 2 },
    { id: 'news', label: 'News', sessions: 0 },
  ],
  gaps: [{ kind: 'rule', reason: 'r', lessonIds: [], drillKind: null }],
  reminder: 'Remember',
};

describe('areaVerdicts', () => {
  it('turns each area of the review into a plain-words verdict from its counts', () => {
    expect(areaVerdicts(REVIEW)).toEqual({
      objectives: '1 of 3 module checkpoints passed so far.',
      calculations: '2 of 3 answers correct, in 2 of 3 areas.',
      rules: '3 of 4 checked trades broke no rule.',
      conditions: '1 of 2 market conditions practised.',
      gaps: '1 thing to work on.',
    });
  });

  it('says when there is nothing yet, in the singular where it applies, and never says "ready"', () => {
    const empty: ProgressReview = {
      ...REVIEW,
      objectives: [objective('a', 'not_attempted')],
      calculations: [{ id: 'z', label: 'Z', answered: 0, correct: 0, accuracy: null }],
      rules: { checkedTrades: 0, withoutBreaks: 0, withStop: 0, reviewed: 0, commonBreaks: [] },
      conditions: [{ id: 'news', label: 'News', sessions: 0 }],
      gaps: [],
    };
    const v = areaVerdicts(empty);
    expect(v).toEqual({
      objectives: '0 of 1 module checkpoint passed so far.',
      calculations: 'No calculation questions answered yet.',
      rules: 'No checked trades yet.',
      conditions: '0 of 1 market condition practised.',
      gaps: 'No gaps found yet from your results.',
    });
    const one = areaVerdicts({ ...empty, calculations: [{ id: 'z', label: 'Z', answered: 1, correct: 1, accuracy: 1 }], rules: { ...empty.rules, checkedTrades: 1, withoutBreaks: 1 }, gaps: REVIEW.gaps.slice(0, 1).concat(REVIEW.gaps) });
    expect(one.calculations).toBe('1 of 1 answer correct, in 1 of 1 area.');
    expect(one.rules).toBe('1 of 1 checked trade broke no rule.');
    expect(one.gaps).toBe('2 things to work on.');
    expect(Object.values(v).concat(Object.values(areaVerdicts(REVIEW))).join(' ')).not.toMatch(/ready/i);
  });
});
