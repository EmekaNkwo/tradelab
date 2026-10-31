import type { UtcIso } from '../../../shared/time';
import type { JournalEntry } from '../../models/journal';
import { processScore } from '../processScore';
import { periodKey, summariesBy, summarise } from '../summaries';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;

const entry = (o: Partial<JournalEntry>): JournalEntry => ({
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
  target: null,
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
  exitRationale: null,
  emotion: null,
  ruleViolations: [],
  noteBefore: null,
  noteAfter: null,
  screenshotUri: null,
  review: { thesis: 't', planVsActual: 'p', rulesFollowed: true, resultNote: 'lost', lesson: 'Wait for the close', nextGoal: 'g', reviewedAt: NOW },
  processScore: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...o,
});

describe('processScore', () => {
  it('gives a disciplined loss full marks and a rule-breaking win a low score', () => {
    expect(processScore(entry({}), 1).score).toBe(1);
    const reckless = processScore(
      entry({ pnlMoney: '900', stop: null, plannedRisk: null, ruleViolations: ['no_stop', 'risk_per_trade'], entryRationale: null, review: { ...entry({}).review!, rulesFollowed: false } }),
      1,
    );
    expect(reckless.score).toBeCloseTo(1 / 5);
    expect(reckless.checks.find((c) => c.id === 'risk_within_limit')!.passed).toBeNull();
  });

  it('flags risk above the limit and an unreviewed trade', () => {
    const r = processScore(entry({ plannedRisk: '250', review: null }), 2);
    expect(r.checks.find((c) => c.id === 'risk_within_limit')).toMatchObject({ passed: false, label: 'Planned risk was within your 2% limit' });
    expect(r.checks.find((c) => c.id === 'followed_plan')!.passed).toBeNull();
    // Judged: stop ✓, risk ✗, rules ✓, reason ✓, reviewed ✗ → 3 of 5.
    expect(r.score).toBeCloseTo(0.6);
  });
});

describe('journal summaries', () => {
  it('uses Monday weeks and calendar months in UTC', () => {
    expect(periodKey('2026-10-29T10:00:00.000Z', 'week')).toBe('2026-10-26');
    expect(periodKey('2026-10-26T00:00:00.000Z', 'week')).toBe('2026-10-26');
    expect(periodKey('2026-11-01T23:00:00', 'week')).toBe('2026-10-26');
    expect(periodKey('2026-10-29T10:00:00.000Z', 'month')).toBe('2026-10');
  });

  it('keeps results per source and reports process rates', () => {
    const s = summarise(
      [
        entry({ processScore: 1 }),
        entry({ id: 'j2', source: 'manual', pnlMoney: '50', stop: null, review: null, ruleViolations: ['no_stop'], processScore: 0.5 }),
        entry({ id: 'j3', source: 'mt_import', pnlMoney: '-20', ruleViolations: ['no_stop', 'daily_loss'], processScore: null }),
      ],
      '2026-10',
    );
    expect(s.trades).toBe(3);
    expect(s.averageProcessScore).toBeCloseTo(0.75);
    // Only paper and manual entries were rule-checked; the import is not counted.
    expect(s.ruleAdherence).toBeCloseTo(1 / 2);
    expect(s.stopRate).toBeCloseTo(2 / 3);
    expect(s.reviewedRate).toBeCloseTo(2 / 3);
    expect(s.commonErrors).toEqual([
      { rule: 'no_stop', count: 2 },
      { rule: 'daily_loss', count: 1 },
    ]);
    expect(s.bySource.map((r) => [r.source, r.trades, r.net.toString(), r.averageProcessScore])).toEqual([
      ['paper', 1, '-100', 1],
      ['manual', 1, '50', 0.5],
      ['mt_import', 1, '-20', null],
    ]);
    expect(summarise([], 'x')).toMatchObject({ trades: 0, averageProcessScore: null, ruleAdherence: null, bySource: [] });
  });

  it('groups simulated trades by when they were logged, not their made-up chart date', () => {
    const groups = summariesBy([entry({ source: 'paper', closedAt: '2020-01-06T00:00:00.000Z' })], 'month');
    expect(groups.map((g) => g.period)).toEqual([entry({}).createdAt.slice(0, 7)]);
  });

  it('groups by period, newest first', () => {
    const groups = summariesBy(
      [entry({ source: 'manual' }), entry({ id: 'b', source: 'manual', closedAt: '2026-09-02T10:00:00.000Z' }), entry({ id: 'c', source: 'manual', closedAt: null })],
      'month',
    );
    expect(groups.map((g) => [g.period, g.trades])).toEqual([
      ['2026-10', 2],
      ['2026-09', 1],
    ]);
  });
});
