import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { StrategyCard } from '../../../components/strategies/StrategyCard';
import { strategyChips } from '../../../components/strategies/strategyChips';
import { AppText, Button, Card, CardHeader, ChoiceChips, EmptyState, ListRow, Notice, RecordsNotice, Screen, SectionHeader, TextField } from '../../../components/ui';
import { BookOpen, FlaskConical, GraduationCap, ListChecks, BriefcaseBusiness } from '../../../components/ui/icons';
import { labLinkFor } from '../../../features/backtest';
import {
  activeFilterCount,
  CATEGORY_LABELS,
  FAMILY_LABELS,
  FILTER_DIMENSIONS,
  HORIZON_LABELS,
  NO_FILTERS,
  useSavedStrategies,
  useStrategyActions,
  useStrategyContent,
  useStrategyLibrary,
  useStrategyProgress,
  type LibraryFilters,
  type Strategy,
  type StrategyCompletion,
} from '../../../features/strategies';
import { useTheme } from '../../../theme';
import { canOpen } from '../../../shared/routeAccess';

const open = (id: string) => router.push({ pathname: '/strategy/[id]', params: { id } });

const subtitle = (s: Strategy) => [FAMILY_LABELS[s.family], HORIZON_LABELS[s.horizon]].join(' · ');

const chipsFor = (s: Strategy, completion: StrategyCompletion | undefined) =>
  strategyChips(s, {
    replay: s.replay !== null && canOpen('/practice/replay'),
    backtest: labLinkFor(s)?.kind === 'template' && canOpen('/backtest/builder'),
    completed: completion?.complete === true,
  });

/** Strategy Library (spec §16.1): search, filters, bookmarks and a study list. */
export default function StrategiesScreen() {
  const { spacing } = useTheme();
  const library = useStrategyLibrary();
  const content = useStrategyContent();
  const saved = useSavedStrategies();
  const progress = useStrategyProgress();
  const actions = useStrategyActions();
  const [showFilters, setShowFilters] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const completion = (id: string) => (progress.status === 'success' ? progress.data.get(id) : undefined);
  const lists = saved.status === 'success' ? saved.data : null;
  const filterCount = activeFilterCount(library.filters);
  const traders = content.traders();
  const program = content.greatTradersProgram();
  const title = (id: string) => content.strategy(id)?.title ?? null;
  const studyItems = (lists?.study ?? []).filter((s) => title(s.strategyId) !== null);
  const bookmarkIds = [...(lists?.bookmarks ?? [])].filter((id) => title(id) !== null);

  const setDimension = (key: keyof LibraryFilters, values: string[]) => library.setFilters({ ...library.filters, [key]: values });
  const move = async (id: string, direction: -1 | 1) => {
    const r = await actions.move(id, direction, studyItems.map((s) => s.strategyId));
    setMoveError(r.ok ? null : 'Your study list could not be reordered. Try again.');
  };

  return (
    <Screen testID="strategies-screen">
      <RecordsNotice queries={[saved, progress]} />
      <Notice title="Education, not signals" tone="info">
        Each page explains a family of ideas with a simplified educational version of its rules, practised on simulated charts. None of it says what to trade, and any strategy can lose money.
      </Notice>
      {studyItems.length > 0 ? (
        <View testID="study-list">
          <Card>
            <CardHeader icon={ListChecks} title="My study list" />
            {studyItems.map((s, i) => (
              <View key={s.strategyId} style={{ gap: spacing.xs }}>
                <ListRow
                  testID={`study-${s.strategyId}`}
                  title={`${i + 1}. ${title(s.strategyId)}`}
                  subtitle={completion(s.strategyId)?.complete ? 'Completed' : 'Not completed yet'}
                  onPress={() => open(s.strategyId)}
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {i > 0 ? <Button label={`Move ${title(s.strategyId)} up`} variant="secondary" onPress={() => void move(s.strategyId, -1)} /> : null}
                  {i < studyItems.length - 1 ? <Button label={`Move ${title(s.strategyId)} down`} variant="secondary" onPress={() => void move(s.strategyId, 1)} /> : null}
                </View>
              </View>
            ))}
            {moveError ? <AppText color="lossText">{moveError}</AppText> : null}
          </Card>
        </View>
      ) : null}
      {bookmarkIds.length > 0 ? (
        <View testID="bookmarks">
          <Card>
            <CardHeader icon={BookOpen} title="Bookmarks" />
            {bookmarkIds.map((id) => (
              <ListRow key={id} testID={`bookmark-${id}`} title={title(id) ?? id} onPress={() => open(id)} />
            ))}
          </Card>
        </View>
      ) : null}
      {(traders.length > 0 && canOpen('/traders')) || (program && canOpen('/learn/programs')) ? (
        <Card>
          <CardHeader icon={GraduationCap} title="Famous traders" />
          {traders.length > 0 && canOpen('/traders') ? (
            <ListRow testID="strategies-traders" title="Trader pages" subtitle="Documented methods, each checked against its sources by a person" onPress={() => router.push('/traders')} />
          ) : null}
          {program && canOpen('/learn/programs') ? <ListRow testID="strategies-great-traders" title={program.title} subtitle={program.summary} onPress={() => router.push('/learn/programs')} /> : null}
        </Card>
      ) : null}
      {canOpen('/backtest') || canOpen('/portfolio') ? (
        <Card>
          {canOpen('/backtest') ? <ListRow testID="strategies-backtest" icon={FlaskConical} title="Backtesting Lab" subtitle="Build rules from blocks and test them on simulated data" onPress={() => router.push('/backtest')} /> : null}
          {canOpen('/portfolio') ? <ListRow testID="strategies-portfolio" icon={BriefcaseBusiness} title="Portfolio and investing sandbox" subtitle="Exposure across paper accounts; a basket against single picks" onPress={() => router.push('/portfolio')} /> : null}
        </Card>
      ) : null}
      <TextField label="Search strategies" value={library.query} onChangeText={library.setQuery} placeholder="For example: breakout, carry, dividend" testID="strategy-search" />
      <Button
        label={showFilters ? 'Hide filters' : filterCount > 0 ? `Filters (${filterCount} on)` : 'Filters'}
        expanded={showFilters}
        variant="secondary"
        onPress={() => setShowFilters((v) => !v)}
      />
      {showFilters ? (
        <View testID="strategy-filters">
          <Card>
            {FILTER_DIMENSIONS.map((d) => (
              <View key={d.key} style={{ gap: spacing.xs }}>
                <AppText variant="label">{d.label}</AppText>
                <ChoiceChips label={d.label} hideLabel options={d.options} selected={library.filters[d.key] as readonly string[]} onChange={(v) => setDimension(d.key, v)} />
              </View>
            ))}
            {filterCount > 0 ? <Button label="Clear filters" variant="secondary" onPress={() => library.setFilters(NO_FILTERS)} /> : null}
          </Card>
        </View>
      ) : null}
      {library.groups.length === 0 ? (
        <EmptyState
          title="No strategies match"
          body="Try fewer words or clear some filters."
          actionLabel="Clear search and filters"
          onAction={() => {
            library.setQuery('');
            library.setFilters(NO_FILTERS);
          }}
        />
      ) : null}
      {library.groups.map((g) => (
        <View key={g.category} testID={`strategy-group-${g.category}`} style={{ gap: spacing.sm }}>
          <SectionHeader title={CATEGORY_LABELS[g.category]} />
          {g.strategies.map((s) => (
            <StrategyCard
              key={s.id}
              testID={`strategy-${s.id}`}
              strategy={s}
              subtitle={subtitle(s)}
              traders={s.traderIds.flatMap((t) => content.trader(t)?.name ?? [])}
              chips={chipsFor(s, completion(s.id))}
              onPress={() => open(s.id)}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
