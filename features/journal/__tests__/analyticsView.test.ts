import type { JournalSummary } from '../../../domain/journal';
import { dec } from '../../../shared/decimal';
import { headline, metricSeries, metricValue, percentText, periodTitle, previousPeriodKey, REVIEW_METRICS, ruleBreakBars } from '../analyticsView';

const summary = (period: string, over: Partial<JournalSummary> = {}): JournalSummary => ({
  period,
  trades: 4,
  averageProcessScore: 0.5,
  ruleAdherence: 0.75,
  stopRate: 1,
  reviewedRate: 0.25,
  commonErrors: [],
  bySource: [{ source: 'paper', trades: 4, net: dec(10), averageProcessScore: 0.5 }],
  ...over,
});

describe('journal review view-model', () => {
  it('reads each metric from the summary', () => {
    const s = summary('2026-10-26');
    expect(REVIEW_METRICS.map((m) => metricValue(s, m))).toEqual([0.75, 0.5, 1, 0.25]);
    expect(percentText(null)).toBe('–');
    expect(percentText(0.824)).toBe('82%');
  });

  it('finds the period right before, across years', () => {
    expect(previousPeriodKey('2026-10-26', 'week')).toBe('2026-10-19');
    expect(previousPeriodKey('2026-01-05', 'week')).toBe('2025-12-29');
    expect(previousPeriodKey('2026-10', 'month')).toBe('2026-09');
    expect(previousPeriodKey('2026-01', 'month')).toBe('2025-12');
    expect(periodTitle('2026-10-26', 'week')).toBe('Week of 2026-10-26');
    expect(periodTitle('2026-10', 'month')).toBe('2026-10');
  });

  it('compares the newest period only with the one right before, when both have a figure', () => {
    expect(headline([], 'plan', 'week')).toBeNull();
    const h = headline([summary('2026-10-26', { ruleAdherence: 0.9 }), summary('2026-10-19', { ruleAdherence: 0.6 })], 'plan', 'week');
    expect(h).toMatchObject({ label: 'Plan-follow rate', period: 'Week of 2026-10-26', text: '90%', change: { delta: 30, text: '30 pts', against: 'Week of 2026-10-19' } });
    expect(h?.spoken).toBe('Plan-follow rate, Week of 2026-10-26, 90 percent');
    // A gap week: no change is shown against an older period.
    expect(headline([summary('2026-10-26'), summary('2026-10-12')], 'plan', 'week')?.change).toBeNull();
    // Nothing to count in either period: no change.
    expect(headline([summary('2026-10-26', { ruleAdherence: null }), summary('2026-10-19')], 'plan', 'week')).toMatchObject({ value: null, text: '–', change: null, spoken: 'Plan-follow rate, Week of 2026-10-26, nothing to count yet' });
    expect(headline([summary('2026-10'), summary('2026-09', { stopRate: null })], 'stops', 'month')?.change).toBeNull();
  });

  it('charts the metric oldest first, leaving out periods with nothing to count', () => {
    const points = metricSeries([summary('2026-10-26', { reviewedRate: 1 }), summary('2026-10-19', { reviewedRate: null }), summary('2026-10-12', { reviewedRate: 0.333 })], 'reviewed');
    expect(points).toEqual([
      { label: '2026-10-12', value: 33 },
      { label: '2026-10-26', value: 100 },
    ]);
    expect(metricSeries(Array.from({ length: 20 }, (_, i) => summary(`p${i}`)), 'plan')).toHaveLength(12);
  });

  it('turns rule breaks into shares of all breaks', () => {
    expect(ruleBreakBars(summary('x'))).toEqual([]);
    expect(ruleBreakBars(summary('x', { commonErrors: [{ rule: 'no_stop', count: 3 }, { rule: 'daily_loss', count: 1 }] }))).toEqual([
      { rule: 'no_stop', label: expect.any(String), count: 3, percent: 75 },
      { rule: 'daily_loss', label: expect.any(String), count: 1, percent: 25 },
    ]);
  });
});
