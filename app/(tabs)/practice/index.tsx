import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Card, CardHeader, ErrorState, ListRow, LoadingState, QuickAction, Screen, SimulatedBadge } from '../../../components/ui';
import { BriefcaseBusiness, ChartCandlestick, ChartColumn, ChartLine, Clock, MonitorSmartphone, Play, Target, type LucideIcon } from '../../../components/ui/icons';
import { DRILL_INFO, SCENARIO_LABELS, useDrillStats, useReplayHistory, type ScenarioKind } from '../../../features/practice';
import { canOpen } from '../../../shared/routeAccess';
import { formatInTimeZone } from '../../../shared/time';
import { useTheme } from '../../../theme';

interface PracticeAction {
  readonly testID: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: LucideIcon;
  readonly route: string;
  readonly primary?: boolean;
}

/** Quick actions (restyle brief §5.3); each shows only when its route can be opened. Paper trading is the main one. */
const ACTIONS: readonly PracticeAction[] = [
  { testID: 'practice-paper', label: 'Paper trading', hint: 'Simulated accounts for forex, stocks, penny stocks, commodities, and futures', icon: ChartCandlestick, route: '/practice/paper', primary: true },
  { testID: 'practice-replay', label: 'Replay', hint: 'Trade a chart one candle at a time; the future stays hidden', icon: Play, route: '/practice/replay' },
  { testID: 'practice-chart-lab', label: 'Chart Lab', hint: 'Indicators and drawing tools on a practice chart', icon: ChartColumn, route: '/practice/chart-lab' },
  { testID: 'practice-metatrader', label: 'MetaTrader', hint: 'Guided tasks to do in your MetaTrader demo account', icon: MonitorSmartphone, route: '/learn/metatrader' },
];

export default function PracticeScreen() {
  const { spacing } = useTheme();
  const stats = useDrillStats();
  const history = useReplayHistory();
  const actions = ACTIONS.filter((a) => canOpen(a.route));
  return (
    <Screen testID="practice-screen">
      <View style={{ gap: spacing.sm }}>
        <SimulatedBadge kind="simulated" />
        <AppText color="textSecondary">Everything here uses simulated charts and simulated money. Nothing is a real trade.</AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md }} testID="practice-actions">
        {actions.map((a) => (
          <QuickAction key={a.testID} testID={a.testID} icon={a.icon} label={a.label} accessibilityHint={a.hint} primary={a.primary} onPress={() => router.push(a.route as never)} />
        ))}
      </View>
      {canOpen('/portfolio') || canOpen('/backtest') ? (
        <Card>
          <CardHeader title="Analyse your practice" />
          {canOpen('/portfolio') ? (
            <ListRow testID="practice-portfolio" icon={BriefcaseBusiness} title="Portfolio" subtitle="Exposure, concentration and drawdown across your paper accounts" onPress={() => router.push('/portfolio')} />
          ) : null}
          {canOpen('/backtest') ? (
            <ListRow testID="practice-backtest" icon={ChartLine} title="Backtesting Lab" subtitle="Test rules on simulated data, with every cost and convention shown" onPress={() => router.push('/backtest')} />
          ) : null}
        </Card>
      ) : null}
      <Card>
        <CardHeader icon={Target} title="Drills" />
        {stats.status === 'loading' ? <LoadingState /> : null}
        {stats.status === 'error' ? <ErrorState error={stats.error} onRetry={stats.reload} /> : null}
        {stats.status === 'success'
          ? stats.data.map((s) => (
              <ListRow
                key={s.kind}
                testID={`drill-${s.kind}`}
                title={DRILL_INFO[s.kind].title}
                subtitle={s.answered + s.neutral === 0 ? DRILL_INFO[s.kind].summary : `${s.correct} of ${s.answered} answered well${s.neutral > 0 ? ` · waited ${s.neutral}` : ''}`}
                onPress={() => router.push({ pathname: '/practice/drill', params: { kind: s.kind } })}
              />
            ))
          : null}
      </Card>
      <Card>
        <CardHeader icon={Clock} title="Recent replays" badge="replay" />
        {history.status === 'error' ? <ErrorState error={history.error} onRetry={history.reload} /> : null}
        {history.status === 'success' && history.data.length === 0 ? <AppText color="textSecondary">No finished replays yet.</AppText> : null}
        {history.status === 'success'
          ? history.data.map((r) => (
              <ListRow
                key={r.id}
                testID="replay-history-item"
                icon={Play}
                iconTone="simulated"
                title={`${SCENARIO_LABELS[r.scenarioKind as ScenarioKind] ?? r.scenarioKind} · ${r.trades.length} trades · process ${r.processScore === null ? 'n/a' : `${Math.round(r.processScore * 100)}%`}`}
                subtitle={formatInTimeZone(r.finishedAt, 'UTC')}
              />
            ))
          : null}
      </Card>
    </Screen>
  );
}
