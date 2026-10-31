import type { JournalEntry, JournalReview } from '../../../domain/models/journal';
import type { UtcIso } from '../../../shared/time';
import { badgeKindOf, dayLabel, entryDay, groupByDay, groupedMoney, processChip, resultView, spokenR } from '../journalView';

const review = (rulesFollowed: boolean): JournalReview => ({ thesis: '', planVsActual: '', rulesFollowed, resultNote: '', lesson: '', nextGoal: '', reviewedAt: '2026-10-29T10:00:00.000Z' as never });

describe('journal view-model', () => {
  it('badges each source: simulated replays and paper trades, MT demo trades', () => {
    expect(badgeKindOf('replay')).toBe('replay');
    expect(badgeKindOf('paper')).toBe('paper');
    expect(badgeKindOf('manual')).toBe('demo');
    expect(badgeKindOf('mt_import')).toBe('demo');
  });

  it('shows a process chip only from what the entry records', () => {
    expect(processChip({ ruleViolations: [], review: null })).toBeNull();
    expect(processChip({ ruleViolations: ['no_stop'], review: null })).toEqual({ kind: 'broke', text: 'Broke 1 rule' });
    // Recorded rule breaks win over the learner's own answer.
    expect(processChip({ ruleViolations: ['no_stop', 'daily_loss'], review: review(true) })).toEqual({ kind: 'broke', text: 'Broke 2 rules' });
    expect(processChip({ ruleViolations: [], review: review(true) })).toEqual({ kind: 'followed', text: 'Followed plan ✓' });
    expect(processChip({ ruleViolations: [], review: review(false) })).toEqual({ kind: 'not_followed', text: 'Plan not followed' });
  });

  it('formats the result from the stored money and R, never estimating', () => {
    expect(resultView({ pnlMoney: null, pnlR: '1' })).toBeNull();
    expect(resultView({ pnlMoney: '-1250.4', pnlR: '-1.25' })).toEqual({ delta: -1250.4, amount: '1,250.40', r: '1.2R' }); // half-even, as the paper screens round R
    expect(resultView({ pnlMoney: '42.5', pnlR: null })).toEqual({ delta: 42.5, amount: '42.50', r: null });
    expect(resultView({ pnlMoney: '-0.001', pnlR: null })?.delta).toBe(-0);
    expect(groupedMoney('1234567.891')).toBe('1,234,567.89');
    expect(spokenR('1.7R')).toBe('1.7 R');
  });

  it('puts a trade on the day the learner did it, in their zone; imports keep the broker date', () => {
    const late = { source: 'paper' as const, closedAt: null, createdAt: '2026-10-29T23:30:00.000Z' as UtcIso };
    expect(entryDay(late, 'Africa/Lagos')).toBe('2026-10-30');
    expect(entryDay(late, 'UTC')).toBe('2026-10-29');
    expect(entryDay({ source: 'mt_import', closedAt: '2026-01-05T23:30:00.000Z', createdAt: '2026-10-29T10:00:00.000Z' as UtcIso }, 'Africa/Lagos')).toBe('2026-01-05');
    // An import without a close time falls back to when it was imported, in the learner's zone (not UTC).
    expect(entryDay({ source: 'mt_import', closedAt: null, createdAt: '2026-10-29T23:30:00.000Z' as UtcIso }, 'Africa/Lagos')).toBe('2026-10-30');
    expect(entryDay({ source: 'manual', closedAt: null, createdAt: '2026-10-29T10:00:00.000Z' as UtcIso }, 'UTC')).toBe('2026-10-29');
    expect(dayLabel('2026-10-29')).toMatch(/^Thu,? 29 Oct 2026$/);
  });

  it('groups by day in list order', () => {
    const e = (id: string, createdAt: string) => ({ id, source: 'paper', closedAt: null, createdAt }) as unknown as JournalEntry;
    const days = groupByDay([e('a', '2026-10-30T09:00:00.000Z'), e('b', '2026-10-29T12:00:00.000Z'), e('c', '2026-10-30T08:00:00.000Z')], 'UTC');
    expect(days.map((d) => [d.date, d.entries.map((x) => x.id)])).toEqual([
      ['2026-10-30', ['a', 'c']],
      ['2026-10-29', ['b']],
    ]);
    expect(groupByDay([], 'UTC')).toEqual([]);
  });
});
