import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { MetricValue } from '../../components/backtest/MetricValue';
import { AppText, Card, CardHeader, ChoiceChips, ErrorState, LoadingState, Notice, Screen, SimulatedBadge } from '../../components/ui';
import { GitBranch } from '../../components/ui/icons';
import { METRIC_ROWS, outOfSampleLine, SIMULATED_DATA_LABEL, useComparison, useMyStrategies, useRuns, type BacktestRun } from '../../features/backtest';
import { formatInTimeZone } from '../../shared/time';
import { useTheme } from '../../theme';

const MAX = 4;

/** Comparison Studio (spec §16.4): 2–4 runs side by side, refused or flagged when they are not comparable, never ranked by profit. */
export default function CompareScreen() {
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const runs = useRuns(null);
  const strategies = useMyStrategies();
  const [selected, setSelected] = useState<string[]>(() => (ids ? ids.split(',').filter(Boolean).slice(0, MAX) : []));
  const names = new Map(strategies.status === 'success' ? strategies.data.map((s) => [s.strategyId, s.name]) : []);
  const label = (r: BacktestRun) => `${names.get(r.strategyId) ?? 'Strategy'} v${r.version} · seed ${r.inputs.dataset.seed} · ${formatInTimeZone(r.createdAt, 'UTC')}`;
  return (
    <Screen testID="compare-screen">
      <AppText variant="title">Comparison Studio</AppText>
      <AppText color="textSecondary">Runs are shown in the order you pick them. Nothing is ranked by profit: look at drawdown, sample size and out-of-sample results first.</AppText>
      <Notice title={SIMULATED_DATA_LABEL}>Runs use simulated candles from the app’s generator unless labelled with your own imported or fetched data. None of these are real account performance.</Notice>
      {runs.status === 'loading' ? <LoadingState /> : null}
      {runs.status === 'error' ? <ErrorState error={runs.error} onRetry={runs.reload} /> : null}
      {runs.status === 'success' ? (
        <ChoiceChips
          label={`Choose 2 to ${MAX} runs`}
          options={runs.data.map((r) => ({ value: r.id, label: label(r) }))}
          selected={selected}
          onChange={(next) => setSelected(next.length > MAX ? next.slice(-MAX) : next)}
        />
      ) : null}
      {selected.length >= 2 ? <Comparison key={selected.join(',')} ids={selected} label={label} /> : <AppText color="textSecondary">Pick at least two runs.</AppText>}
    </Screen>
  );
}

function Comparison({ ids, label }: { readonly ids: readonly string[]; readonly label: (r: BacktestRun) => string }) {
  const { spacing } = useTheme();
  const cmp = useComparison(ids);
  if (cmp.status === 'loading') return <LoadingState />;
  if (cmp.status === 'error') return <ErrorState error={cmp.error} onRetry={cmp.reload} />;
  const refused = cmp.data.issues.filter((i) => i.severity === 'refuse');
  const warned = cmp.data.issues.filter((i) => i.severity === 'warn');
  if (refused.length > 0) {
    return (
      <Notice title="These runs cannot be compared" tone="warning">
        {refused.map((i) => `• ${i.message}`).join('\n')}
      </Notice>
    );
  }
  const runs = cmp.data.runs;
  return (
    <View style={{ gap: spacing.md }} testID="comparison">
      {warned.length > 0 ? (
        <Notice title="Compare with care" tone="warning">
          {warned.map((i) => `• ${i.message}`).join('\n')}
        </Notice>
      ) : null}
      {runs.map(({ run }, k) => (
        <AppText key={run.id} variant="caption">{`Run ${k + 1}: ${label(run)}${run.result.warnings.length ? ` · ${run.result.warnings.length} warning${run.result.warnings.length === 1 ? '' : 's'}` : ''}`}</AppText>
      ))}
      <Card>
        <CardHeader icon={GitBranch} title="Out-of-sample" badge="backtest" />
        {runs.map(({ run }, k) => (
          <AppText key={run.id} testID="compare-oos">{`Run ${k + 1}: ${outOfSampleLine(run.inputs.split.kind, run.result.split)}`}</AppText>
        ))}
      </Card>
      {METRIC_ROWS.map((row) => (
        <Card key={row.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' }}>
            <AppText variant="label">{row.label}</AppText>
            <SimulatedBadge kind="backtest" />
          </View>
          {runs.map(({ run }, k) => (
            <View key={run.id} testID={`compare-${row.key}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <AppText color="textSecondary" accessibilityElementsHidden importantForAccessibility="no">{`Run ${k + 1}`}</AppText>
              <MetricValue row={row} metrics={run.result.metrics} prefix={`Run ${k + 1}`} />
            </View>
          ))}
          <AppText variant="caption" color="textSecondary">{row.explain}</AppText>
        </Card>
      ))}
    </View>
  );
}
