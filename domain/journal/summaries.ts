import { dec, type Decimal } from '../../shared/decimal';
import { activityDate, JOURNAL_SOURCES, RULE_CHECKED_SOURCES, type JournalEntry, type JournalSource } from '../models/journal';

/**
 * Weekly and monthly journal summaries (spec §22). Results are kept per
 * source, because simulated and demo results are not comparable. The
 * headline numbers are about process: adherence, stops, reviews.
 */

export type SummaryPeriod = 'week' | 'month';

/** Period key in UTC: the Monday of the week ("2026-10-26") or the month ("2026-10"). */
export function periodKey(iso: string, period: SummaryPeriod): string {
  if (period === 'month') return iso.slice(0, 7);
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(ms - weekday * 86_400_000).toISOString().slice(0, 10);
}

export interface SourceResult {
  readonly source: JournalSource;
  readonly trades: number;
  readonly net: Decimal;
  readonly averageProcessScore: number | null;
}

export interface JournalSummary {
  readonly period: string;
  readonly trades: number;
  readonly averageProcessScore: number | null;
  /** Share of rule-checked trades (paper, manual) with no rule broken; imports and replays are not counted. */
  readonly ruleAdherence: number | null;
  readonly stopRate: number | null;
  readonly reviewedRate: number | null;
  /** Most frequent rule breaks, most common first. */
  readonly commonErrors: readonly { readonly rule: string; readonly count: number }[];
  readonly bySource: readonly SourceResult[];
}

const share = (n: number, of: number): number | null => (of === 0 ? null : n / of);
const average = (entries: readonly JournalEntry[]): number | null => {
  const scores = entries.map((e) => e.processScore).filter((s): s is number => s !== null);
  return scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length;
};

export function summarise(entries: readonly JournalEntry[], period: string): JournalSummary {
  const checked = entries.filter((e) => RULE_CHECKED_SOURCES.includes(e.source));
  const counts = new Map<string, number>();
  for (const rule of entries.flatMap((e) => e.ruleViolations)) counts.set(rule, (counts.get(rule) ?? 0) + 1);
  return {
    period,
    trades: entries.length,
    averageProcessScore: average(entries),
    ruleAdherence: share(checked.filter((e) => e.ruleViolations.length === 0).length, checked.length),
    stopRate: share(entries.filter((e) => e.stop !== null).length, entries.length),
    reviewedRate: share(entries.filter((e) => e.review !== null).length, entries.length),
    commonErrors: [...counts.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule)),
    bySource: JOURNAL_SOURCES.map((source) => {
      const mine = entries.filter((e) => e.source === source);
      return { source, trades: mine.length, net: mine.reduce((sum, e) => (e.pnlMoney ? sum.plus(e.pnlMoney) : sum), dec(0)), averageProcessScore: average(mine) };
    }).filter((r) => r.trades > 0),
  };
}

/** One summary per period, newest first. Entries are grouped by when the learner did them (see `activityDate`). */
export function summariesBy(entries: readonly JournalEntry[], period: SummaryPeriod): readonly JournalSummary[] {
  const groups = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = periodKey(activityDate(e), period);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, group]) => summarise(group, key));
}
