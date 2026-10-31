import { useState } from 'react';
import { View } from 'react-native';
import {
  badgeKindOf,
  groupedMoney,
  headline,
  JOURNAL_SOURCE_LABELS,
  metricSeries,
  percentText,
  periodTitle,
  REVIEW_METRIC_CHIPS,
  REVIEW_METRIC_LABELS,
  REVIEW_METRIC_NOTES,
  REVIEW_METRICS,
  ruleBreakBars,
  ruleShortName,
  type JournalSummary,
  type ReviewMetric,
  type SummaryPeriod,
} from '../../features/journal';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { CategoryBar } from '../ui/CategoryBar';
import { ChangeChip } from '../ui/ChangeChip';
import { ChoiceChips } from '../ui/ChoiceChips';
import { AreaChart } from '../ui/charts/AreaChart';
import { ChartLine, ChartColumn, NotebookPen, TriangleAlert } from '../ui/icons';
import { PnLValue } from '../ui/PnLValue';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SimulatedBadge } from '../ui/SimulatedBadge';
import { directionOf } from '../ui/valueParts';

const METRIC_OPTIONS = REVIEW_METRICS.map((m) => ({ value: m, label: REVIEW_METRIC_CHIPS[m] }));
const percent = (v: number) => `${v}%`;

/** The newest period's process rate, its change from the period before, and the rate over time (brief §5.6). */
export function HeadlineCard({ summaries, period }: { readonly summaries: readonly JournalSummary[]; readonly period: SummaryPeriod }) {
  const { spacing } = useTheme();
  const [metric, setMetric] = useState<ReviewMetric>('plan');
  const h = headline(summaries, metric, period);
  if (!h) return null;
  const points = metricSeries(summaries, metric);
  return (
    <Card testID="review-headline">
      <CardHeader icon={ChartLine} title={h.label} />
      <ChoiceChips label="Headline figure" single options={METRIC_OPTIONS} selected={[metric]} onChange={(v) => v[0] && setMetric(v[0])} testIDPrefix="review-metric" />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="display" tabular accessibilityLabel={h.spoken} testID="review-headline-value">
          {h.text}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {h.period}
        </AppText>
        {h.change ? (
          <ChangeChip testID="review-headline-change" direction={directionOf(h.change.delta)} value={h.change.text} tone="neutral" subject={`${h.label} vs ${h.change.against}`} />
        ) : h.value !== null ? (
          <AppText variant="caption" color="textSecondary">
            No figure for the period before to compare with.
          </AppText>
        ) : null}
      </View>
      <AppText color="textSecondary">{REVIEW_METRIC_NOTES[metric]}</AppText>
      <AreaChart
        testID="review-chart"
        title={`${REVIEW_METRIC_LABELS[metric]} by ${period}, ${period === 'week' ? 'weeks' : 'months'} with trades only`}
        points={points.map((p) => ({ label: p.label, value: p.value }))}
        format={percent}
      />
      <AppText variant="caption" color="textSecondary">
        {`Only ${period === 'week' ? 'weeks' : 'months'} with trades are shown, so gaps are closed up.`}
      </AppText>
    </Card>
  );
}

const TABS = [
  { value: 'rules', label: 'Rule breaks' },
  { value: 'sources', label: 'Sources' },
] as const;

/** Rule breaks by type, or trades by source, for the newest period. Counts only; money stays in the period cards. */
export function BreakdownCard({ summary, period }: { readonly summary: JournalSummary; readonly period: SummaryPeriod }) {
  const [tab, setTab] = useState<'rules' | 'sources'>('rules');
  const bars = ruleBreakBars(summary);
  return (
    <Card testID="review-breakdown">
      <CardHeader icon={ChartColumn} title={`Breakdown · ${periodTitle(summary.period, period)}`} />
      <SegmentedControl label="Breakdown" options={TABS} value={tab} onChange={setTab} testIDPrefix="review-breakdown" />
      {tab === 'rules' ? (
        bars.length === 0 ? (
          <AppText color="textSecondary">No rule breaks recorded.</AppText>
        ) : (
          bars.map((b) => (
            <CategoryBar key={b.rule} testID={`review-rule-${b.rule}`} icon={TriangleAlert} iconTone="warning" fill="warning" label={b.label} percent={b.percent} value={`${b.count}×`} caption={`${Math.round(b.percent)}% of rule breaks`} />
          ))
        )
      ) : (
        summary.bySource.map((r) => (
          <CategoryBar
            key={r.source}
            testID={`review-source-${r.source}`}
            icon={NotebookPen}
            label={JOURNAL_SOURCE_LABELS[r.source]}
            percent={(r.trades / summary.trades) * 100}
            value={`${r.trades} ${r.trades === 1 ? 'trade' : 'trades'}`}
            caption={`process ${percentText(r.averageProcessScore)}`}
          />
        ))
      )}
    </Card>
  );
}

/** One period: process first, then results kept per source, each with its own badge. */
export function PeriodCard({ s, period }: { readonly s: JournalSummary; readonly period: SummaryPeriod }) {
  const { spacing } = useTheme();
  return (
    <Card>
      <AppText variant="heading" testID="summary-period">
        {periodTitle(s.period, period)}
      </AppText>
      <AppText tabular>{`${s.trades} trades · average process ${percentText(s.averageProcessScore)}`}</AppText>
      <AppText tabular>{`Followed every risk rule (paper and hand-entered trades): ${percentText(s.ruleAdherence)} · Stop set: ${percentText(s.stopRate)} · Reviewed: ${percentText(s.reviewedRate)}`}</AppText>
      {s.commonErrors.length > 0 ? (
        <AppText>{`Common errors: ${s.commonErrors.map((e) => `${ruleShortName(e.rule)} (${e.count})`).join(', ')}`}</AppText>
      ) : (
        <AppText color="textSecondary">No rule breaks recorded.</AppText>
      )}
      <AppText variant="label" color="textSecondary">
        By source (results never added together)
      </AppText>
      {s.bySource.map((r) => {
        const shown = r.net.toFixed(2);
        const label = JOURNAL_SOURCE_LABELS[r.source];
        return (
          <View key={r.source} testID={`summary-source-${r.source}`} style={{ gap: spacing.xs, paddingVertical: spacing.xs }}>
            <AppText tabular>{`${label}: ${r.trades} trades · process ${percentText(r.averageProcessScore)}`}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
              <SimulatedBadge kind={badgeKindOf(r.source)} />
              <PnLValue direction={directionOf(Number(shown), 2)} amount={groupedMoney(shown)} subject={`${label} net result`} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}
