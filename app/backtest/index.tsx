import { router } from 'expo-router';
import { AppText, Card, CardHeader, EmptyState, ErrorState, ListRow, LoadingState, Notice, Screen } from '../../components/ui';
import { BookOpen, BriefcaseBusiness, FlaskConical, Repeat } from '../../components/ui/icons';
import { BACKTEST_TEMPLATES, PROCESS_NOTE, SIMULATED_DATA_LABEL, statsLine, useMyStrategies, useRuns } from '../../features/backtest';
import { formatInTimeZone } from '../../shared/time';
import { canOpen } from '../../shared/routeAccess';

/** Backtesting Lab home (spec §16.2–16.4): your strategies, templates, recent runs. */
export default function BacktestHome() {
  const strategies = useMyStrategies();
  const runs = useRuns(null);
  return (
    <Screen testID="backtest-home">
      <AppText variant="title">Backtesting Lab</AppText>
      <Notice title={SIMULATED_DATA_LABEL}>{`Backtests run on simulated candles from a seeded generator, unless you choose your own imported or fetched data on the run screen; real data is always labelled with its source. ${PROCESS_NOTE}`}</Notice>
      <Card>
        <CardHeader icon={FlaskConical} title="Your strategies" />
        {strategies.status === 'loading' ? <LoadingState /> : null}
        {strategies.status === 'error' ? <ErrorState error={strategies.error} onRetry={strategies.reload} /> : null}
        {strategies.status === 'success' && strategies.data.length === 0 ? (
          <EmptyState title="No strategies yet" body="Build one from rule blocks, or start from a Strategy Library example below." actionLabel="Build a strategy" onAction={() => router.push('/backtest/builder')} />
        ) : null}
        {strategies.status === 'success'
          ? strategies.data.map((s) => (
              <ListRow key={s.strategyId} testID="my-strategy" title={s.name} subtitle={`v${s.version} · ${s.definition.timeframe} · saved ${formatInTimeZone(s.createdAt, 'UTC')}`} onPress={() => router.push({ pathname: '/backtest/strategy/[id]', params: { id: s.strategyId } })} />
            ))
          : null}
        {strategies.status === 'success' && strategies.data.length > 0 ? <ListRow testID="new-strategy" title="Build a new strategy" onPress={() => router.push('/backtest/builder')} /> : null}
      </Card>
      <Card>
        <CardHeader icon={BookOpen} title="Start from a library example" />
        <AppText color="textSecondary">Each opens as your own copy; the library page stays as it is.</AppText>
        {BACKTEST_TEMPLATES.map((t) => (
          <ListRow key={t.strategyId} testID={`template-${t.strategyId}`} title={t.name} subtitle={`${t.definition.timeframe} · ${t.simplifications.length} simplification${t.simplifications.length === 1 ? '' : 's'} listed`} onPress={() => router.push({ pathname: '/backtest/builder', params: { template: t.strategyId } })} />
        ))}
      </Card>
      <Card>
        <CardHeader icon={Repeat} title="Recent runs" badge="backtest" />
        {runs.status === 'error' ? <ErrorState error={runs.error} onRetry={runs.reload} /> : null}
        {runs.status === 'success' && runs.data.length === 0 ? <AppText color="textSecondary">No backtests yet.</AppText> : null}
        {runs.status === 'success'
          ? runs.data.slice(0, 10).map((r) => (
              <ListRow key={r.id} testID="recent-run" title={`${r.result.dataLabel}${r.inputs.dataset.datasetId ? '' : ` · seed ${r.inputs.dataset.seed}`} · ${r.inputs.dataset.candles} candles`} subtitle={statsLine(r.result.metrics)} onPress={() => router.push({ pathname: '/backtest/result/[id]', params: { id: r.id } })} />
            ))
          : null}
        {runs.status === 'success' && runs.data.length >= 2 ? <ListRow testID="open-compare" title="Comparison Studio" subtitle="Put 2 to 4 runs side by side" onPress={() => router.push('/backtest/compare')} /> : null}
      </Card>
      {canOpen('/portfolio') ? (
        <Card>
          <ListRow testID="open-portfolio" icon={BriefcaseBusiness} title="Portfolio" subtitle="Exposure across your paper accounts, and the long-term investing sandbox" onPress={() => router.push('/portfolio')} />
        </Card>
      ) : null}
    </Screen>
  );
}
