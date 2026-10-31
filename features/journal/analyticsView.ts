import type { JournalSummary, SummaryPeriod } from '../../domain/journal';
import { ruleShortName } from '../../domain/risk/rules';

/**
 * Pure view-model for the journal review (analytics) screen (restyle brief §5.6). Every figure is a field of the
 * stored `JournalSummary` (domain/journal/summaries.ts); nothing new is measured. Only process rates are offered:
 * results stay per source, never added together, so there is no combined expectancy or equity curve.
 */

export const REVIEW_METRICS = ['plan', 'process', 'stops', 'reviewed'] as const;
export type ReviewMetric = (typeof REVIEW_METRICS)[number];

export const REVIEW_METRIC_LABELS: Readonly<Record<ReviewMetric, string>> = {
  plan: 'Plan-follow rate',
  process: 'Average process score',
  stops: 'Stop set',
  reviewed: 'Reviewed',
};

/** Short chip labels for choosing the headline metric. */
export const REVIEW_METRIC_CHIPS: Readonly<Record<ReviewMetric, string>> = {
  plan: 'Plan-follow',
  process: 'Process',
  stops: 'Stops',
  reviewed: 'Reviewed',
};

/** What each rate counts, shown under the headline. */
export const REVIEW_METRIC_NOTES: Readonly<Record<ReviewMetric, string>> = {
  plan: 'Paper and hand-entered trades with no risk rule broken.',
  process: 'How the trades were run, not whether they made money.',
  stops: 'Trades with a stop loss set when they opened.',
  reviewed: 'Trades you reviewed with the six questions.',
};

/** How many periods the chart shows, newest last. */
export const CHART_PERIODS = 12;

export function metricValue(s: JournalSummary, metric: ReviewMetric): number | null {
  if (metric === 'plan') return s.ruleAdherence;
  if (metric === 'process') return s.averageProcessScore;
  if (metric === 'stops') return s.stopRate;
  return s.reviewedRate;
}

/** A 0–1 share as a whole percent, e.g. "82%"; "–" when there is nothing to count. */
export function percentText(share: number | null): string {
  return share === null ? '–' : `${Math.round(share * 100)}%`;
}

/** The key of the period just before `key`: the Monday a week earlier ("2026-10-19"), or the month before ("2026-09"). */
export function previousPeriodKey(key: string, period: SummaryPeriod): string {
  if (period === 'week') return new Date(Date.parse(`${key}T00:00:00.000Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const [y = 0, m = 1] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** "Week of 2026-10-26" or "2026-10". */
export function periodTitle(key: string, period: SummaryPeriod): string {
  return period === 'week' ? `Week of ${key}` : key;
}

export interface HeadlineChange {
  /** Whole percentage points, signed. */
  readonly delta: number;
  /** Unsigned, e.g. "12 pts". */
  readonly text: string;
  /** "Week of 2026-10-19" — what it is compared with. */
  readonly against: string;
}

export interface Headline {
  readonly label: string;
  readonly period: string;
  readonly value: number | null;
  readonly text: string;
  /** Against the period right before, only when both periods have a value for this metric. */
  readonly change: HeadlineChange | null;
  /** What a screen reader says for the figure. */
  readonly spoken: string;
}

/** The newest period's figure for the metric, with the change from the immediately previous period. */
export function headline(summaries: readonly JournalSummary[], metric: ReviewMetric, period: SummaryPeriod): Headline | null {
  const latest = summaries[0];
  if (!latest) return null;
  const value = metricValue(latest, metric);
  const prevKey = previousPeriodKey(latest.period, period);
  const prev = summaries.find((s) => s.period === prevKey);
  const prevValue = prev ? metricValue(prev, metric) : null;
  const label = REVIEW_METRIC_LABELS[metric];
  const title = periodTitle(latest.period, period);
  const change =
    value !== null && prevValue !== null
      ? (() => {
          const delta = Math.round(value * 100) - Math.round(prevValue * 100);
          return { delta, text: `${Math.abs(delta)} pts`, against: periodTitle(prevKey, period) };
        })()
      : null;
  const spoken = value === null ? `${label}, ${title}, nothing to count yet` : `${label}, ${title}, ${Math.round(value * 100)} percent`;
  return { label, period: title, value, text: percentText(value), change, spoken };
}

export interface SeriesPoint {
  readonly label: string;
  /** Whole percent, 0–100. */
  readonly value: number;
}

/** The metric over the newest periods, oldest first; periods with nothing to count are left out. */
export function metricSeries(summaries: readonly JournalSummary[], metric: ReviewMetric): readonly SeriesPoint[] {
  return summaries
    .slice(0, CHART_PERIODS)
    .flatMap((s) => {
      const v = metricValue(s, metric);
      return v === null ? [] : [{ label: s.period, value: Math.round(v * 100) }];
    })
    .reverse();
}

export interface RuleBreakBar {
  readonly rule: string;
  readonly label: string;
  readonly count: number;
  /** Share of all rule breaks in the period, 0–100. */
  readonly percent: number;
}

/** A period's rule breaks by type, most common first, as shares of all its breaks. */
export function ruleBreakBars(s: JournalSummary): readonly RuleBreakBar[] {
  const total = s.commonErrors.reduce((n, e) => n + e.count, 0);
  if (total === 0) return [];
  return s.commonErrors.map((e) => ({ rule: e.rule, label: ruleShortName(e.rule), count: e.count, percent: (e.count / total) * 100 }));
}
