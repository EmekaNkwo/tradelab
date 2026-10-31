/**
 * The coach's request builders turn the app's own records into facts for the
 * coach. These check what each fact is computed from, and what is left out.
 */
import type { JournalEntry } from '../../../domain/models/journal';
import type { UtcIso } from '../../../shared/time';
import { shippedContent } from '../../../testing/strategyFixtures';
import { conceptContext, conceptRequest, findGlossaryEntry, journalContext, practiceRequest } from '../requests';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const content = shippedContent();

const entry = (o: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'j1',
  source: 'paper',
  sourceRef: null,
  externalId: null,
  market: 'forex',
  instrument: 'EUR/USD (simulated)',
  direction: 'buy',
  strategy: null,
  entry: '1.1',
  stop: '1.09',
  target: '1.12',
  size: '0.1',
  sizeUnit: 'lots',
  exit: '1.09',
  pnlMoney: '-100',
  pnlPips: '-100',
  pnlR: '-1',
  plannedRisk: '100',
  costs: '0',
  equityAtEntry: '10000',
  openedAt: null,
  closedAt: '2026-10-28T10:00:00.000Z',
  conditions: null,
  entryRationale: 'Retest of the range top',
  exitRationale: 'Stopped out',
  emotion: { confidence: 4, stress: 2, patience: 3, feeling: 'calm' },
  ruleViolations: [],
  noteBefore: null,
  noteAfter: null,
  screenshotUri: null,
  review: { thesis: 'Range retest', planVsActual: 'As planned', rulesFollowed: true, resultNote: 'lost', lesson: 'Wait for the close', nextGoal: '', reviewedAt: NOW },
  processScore: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...o,
});

describe('findGlossaryEntry', () => {
  it('finds a term by id, by its name and by an alias, ignoring case and spaces', () => {
    expect(findGlossaryEntry(content, 'spread')?.id).toBe('spread');
    expect(findGlossaryEntry(content, '  SPREAD ')?.id).toBe('spread');
    expect(findGlossaryEntry(content, 'Bid-Ask Spread')?.id).toBe('spread');
  });

  it('returns null for an empty query or an unknown term', () => {
    expect(findGlossaryEntry(content, '   ')).toBeNull();
    expect(findGlossaryEntry(content, 'not a real term')).toBeNull();
  });
});

describe('conceptContext', () => {
  it('uses the definition at the learner’s level, with glossary links turned into plain words', () => {
    const simple = conceptContext(content, 'spread', 'simple');
    expect(simple.term).toBe('Spread');
    expect(simple.definition).toContain('The gap between the ask price and the bid price');
    expect(simple.definition).not.toContain('[[');
    expect(simple.example).toMatch(/^Bid 1\.1000, ask 1\.1002/);
    const balanced = conceptContext(content, 'spread', 'balanced');
    expect(balanced.definition).toMatch(/^Ask minus bid/);
  });

  it('names related terms and at most three lessons that link to the term', () => {
    const c = conceptContext(content, 'spread', 'simple');
    // Related ids are shown by their terms, not their ids.
    expect(c.related).toEqual(expect.arrayContaining(['Bid', 'Ask']));
    expect(c.lessonTitles.length).toBeGreaterThan(0);
    expect(c.lessonTitles.length).toBeLessThanOrEqual(3);
  });

  it('keeps a term with no example without one', () => {
    expect(conceptContext(content, 'account-manager-scam', 'simple').example).toBeNull();
  });

  it('passes an unknown term through, trimmed and capped, with no facts', () => {
    const c = conceptContext(content, `  ${'x'.repeat(100)}  `, 'simple');
    expect(c).toEqual({ term: 'x'.repeat(80), definition: null, example: null, related: [], lessonTitles: [] });
  });

  it('builds explain and practice requests around the context', () => {
    const c = conceptContext(content, 'spread', 'simple');
    expect(conceptRequest(c, 'simple', 'Why?')).toEqual({ task: 'explain_concept', level: 'simple', concept: c, question: 'Why?' });
    expect(practiceRequest(c, 'balanced')).toEqual({ task: 'extra_practice', level: 'balanced', concept: c });
  });
});

describe('journalContext', () => {
  it('states the trade, its planned risk as a share of equity, and the review', () => {
    const c = journalContext(entry(), 1, null);
    expect(c).toMatchObject({
      instrument: 'EUR/USD (simulated)',
      side: 'buy',
      source: 'Paper trading (simulated)',
      hadStop: true,
      hadTarget: true,
      plannedRiskPercent: '1',
      riskLimitPercent: '1',
      ruleBreaks: [],
      rationale: 'Retest of the range top / Stopped out',
      review: 'Range retest / As planned / Wait for the close',
      emotions: ['confidence 4/5', 'stress 2/5', 'patience 3/5', 'calm'],
      strategyRules: null,
    });
    expect(c.processScorePercent).toBe(100);
  });

  it('names rule breaks by their short names, and a risk above the limit', () => {
    const c = journalContext(entry({ ruleViolations: ['no_stop', 'some_future_rule'], stop: null, plannedRisk: '300' }), 1, ['Enter on a close above the range']);
    expect(c.hadStop).toBe(false);
    expect(c.plannedRiskPercent).toBe('3');
    expect(c.ruleBreaks).toEqual(expect.arrayContaining(['No stop loss', 'some_future_rule']));
    expect(c.ruleBreaks.some((b) => b.endsWith(': no'))).toBe(true);
    expect(c.strategyRules).toEqual(['Enter on a close above the range']);
  });

  it('leaves out what was not recorded', () => {
    const c = journalContext(
      entry({ target: '  ', stop: '', plannedRisk: null, equityAtEntry: null, entryRationale: '  ', exitRationale: null, emotion: { confidence: 3, stress: 3, patience: 3, feeling: null }, review: null }),
      2,
      null,
    );
    expect(c.hadStop).toBe(false);
    expect(c.hadTarget).toBe(false);
    expect(c.plannedRiskPercent).toBeNull();
    expect(c.rationale).toBe('');
    expect(c.review).toBe('');
    expect(c.emotions).toEqual(['confidence 3/5', 'stress 3/5', 'patience 3/5']);
  });

  it('gives no risk share when equity is zero, and no emotions when none were rated', () => {
    const c = journalContext(entry({ equityAtEntry: '0', emotion: null, source: 'mt_import' }), 1, null);
    expect(c.plannedRiskPercent).toBeNull();
    expect(c.emotions).toEqual([]);
    expect(c.source).toBe('Imported from MT statement');
  });
});
