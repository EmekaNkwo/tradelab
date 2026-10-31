import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { JournalDayCard } from '../../../components/journal/JournalDayCard';
import { AppText, Card, ChoiceChips, EmptyState, ErrorState, ListRow, ListScreen, LoadingState } from '../../../components/ui';
import { BookOpen, ChartColumn, Inbox, NotebookPen, Plus } from '../../../components/ui/icons';
import { groupByDay, JOURNAL_LIST_LIMIT, JOURNAL_SOURCE_LABELS, JOURNAL_SOURCES, useJournalList, type JournalDay, type JournalEntry, type JournalSource } from '../../../features/journal';
import { useSettings } from '../../../features/settings';
import { DEFAULT_TIME_ZONE } from '../../../shared/time';

const FILTERS = [{ value: 'all', label: 'All' }, ...JOURNAL_SOURCES.map((s) => ({ value: s, label: JOURNAL_SOURCE_LABELS[s] }))] as const;

/** Source, process score and review state; the result is shown separately, with sign, arrow and badge. */
function subtitle(e: JournalEntry): string {
  const process = e.processScore === null ? 'process n/a' : `process ${Math.round(e.processScore * 100)}%`;
  return `${JOURNAL_SOURCE_LABELS[e.source]} · ${process}${e.review ? ' · reviewed' : ''}`;
}

const NO_DAYS: readonly JournalDay<JournalEntry>[] = [];
const open = (e: JournalEntry) => router.push({ pathname: '/journal/entry/[id]', params: { id: e.id } });

export default function JournalScreen() {
  const [filter, setFilter] = useState<'all' | JournalSource>('all');
  const list = useJournalList(filter === 'all' ? null : filter);
  const settings = useSettings();
  const timeZone = settings.status === 'success' ? settings.data.timeZone : DEFAULT_TIME_ZONE;
  const days = useMemo(() => (list.status === 'success' ? groupByDay(list.data, timeZone) : NO_DAYS), [list, timeZone]);
  return (
    <ListScreen
      testID="journal-screen"
      itemStyle="cards"
      header={
        <>
          <AppText color="textSecondary">Every practice trade lands here. Sources stay separate: simulated results and demo results are never added together.</AppText>
          <Card>
            <ListRow testID="journal-new" icon={Plus} title="Add a demo trade" subtitle="Type in a trade from your MetaTrader demo account" onPress={() => router.push('/journal/new')} />
            <ListRow testID="journal-import" icon={Inbox} title="Import an MT statement" subtitle="Bring in closed demo trades from an HTML account statement" onPress={() => router.push('/journal/import')} />
            <ListRow testID="journal-stats" icon={ChartColumn} title="Weekly and monthly review" subtitle="Rule adherence, stops, reviews, and common errors" onPress={() => router.push('/journal/stats')} />
            <ListRow testID="journal-psychology" icon={BookOpen} title="Psychology Lab" subtitle="Practise your response to common thinking traps" onPress={() => router.push('/journal/psychology')} />
          </Card>
          <ChoiceChips label="Show" single options={FILTERS} selected={[filter]} onChange={(v) => v[0] && setFilter(v[0])} />
          {list.status === 'loading' ? <LoadingState /> : null}
          {list.status === 'error' ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
        </>
      }
      data={days}
      keyExtractor={(d) => d.date}
      renderItem={(d) => <JournalDayCard day={d} subtitle={subtitle} onOpen={open} />}
      empty={list.status === 'success' ? <EmptyState icon={NotebookPen} title="No trades yet" body="Finish a replay, close a paper trade, or add a demo trade." /> : null}
      footer={
        list.status === 'success' && list.data.length >= JOURNAL_LIST_LIMIT ? (
          <AppText color="textSecondary">{`Showing your newest ${JOURNAL_LIST_LIMIT} trades. Filter by source to see others.`}</AppText>
        ) : null
      }
    />
  );
}
