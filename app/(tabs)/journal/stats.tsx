import { useState } from 'react';
import { BreakdownCard, HeadlineCard, PeriodCard } from '../../../components/journal/ReviewCards';
import { AppText, EmptyState, ErrorState, Screen, SegmentedControl, SectionHeader, SkeletonState } from '../../../components/ui';
import { ChartColumn } from '../../../components/ui/icons';
import { useJournalSummaries, type SummaryPeriod } from '../../../features/journal';

const PERIODS = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
] as const;

/**
 * Weekly and monthly journal review (spec §22; restyle brief §5.6 analytics): a process rate as the headline with
 * its change from the period before, the rate over time, breakdowns, then every period with results per source.
 */
export default function JournalStatsScreen() {
  const [period, setPeriod] = useState<SummaryPeriod>('week');
  const summaries = useJournalSummaries(period);
  const latest = summaries.status === 'success' ? summaries.data[0] : undefined;
  return (
    <Screen testID="journal-stats-screen">
      <SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} testIDPrefix="journal-period" />
      {summaries.status === 'loading' ? <SkeletonState rows={2} /> : null}
      {summaries.status === 'error' ? <ErrorState error={summaries.error} /> : null}
      {summaries.truncated ? <AppText color="textSecondary">Summaries cover your newest 2,000 trades; older ones are left out.</AppText> : null}
      {summaries.status === 'success' && summaries.data.length === 0 ? <EmptyState icon={ChartColumn} title="Nothing to review yet" body="No journal entries yet." /> : null}
      {summaries.status === 'success' && latest ? (
        <>
          <HeadlineCard summaries={summaries.data} period={period} />
          <BreakdownCard summary={latest} period={period} />
          <SectionHeader title={period === 'week' ? 'Every week' : 'Every month'} />
          {summaries.data.map((s) => (
            <PeriodCard key={s.period} s={s} period={period} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
