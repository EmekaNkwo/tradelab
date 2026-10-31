import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ConventionsCard } from '../../../components/backtest/ConventionsCard';
import { ResultCurves, ResultMetrics } from '../../../components/backtest/ResultMetrics';
import { AppText, Button, Card, CardHeader, ChoiceChips, EmptyState, ErrorState, LoadingState, Notice, PnLValue, Screen, SimulatedBadge } from '../../../components/ui';
import { Gauge, GitBranch, Layers, Repeat, TriangleAlert } from '../../../components/ui/icons';
import { directionOf } from '../../../components/ui/valueParts';
import {
  formatPercent,
  formatUsd,
  PROCESS_NOTE,
  REGIME_LABELS,
  REGIME_NOTE,
  splitHeading,
  staleRunNote,
  sensitivityParameters,
  signedR,
  SKIP_LABELS,
  statsLine,
  useRerun,
  useRunRecord,
  useSensitivity,
  useStrategyVersions,
  type BacktestRun,
  type StrategyVersion,
} from '../../../features/backtest';
import { errorText } from '../../../shared/errors';
import { formatInTimeZone } from '../../../shared/time';
import { useTheme } from '../../../theme';

/** A saved backtest's report (spec §16.3). */
export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useRunRecord(id ?? '');
  if (run.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (run.status === 'error') return <Screen><ErrorState error={run.error} onRetry={run.reload} /></Screen>;
  if (!run.data) return <Screen><EmptyState title="Backtest not found" body="It may have been removed by restoring a backup." actionLabel="Back" onAction={() => router.back()} /></Screen>;
  return <WithVersion run={run.data} />;
}

function WithVersion({ run }: { readonly run: BacktestRun }) {
  const versions = useStrategyVersions(run.strategyId);
  if (versions.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (versions.status === 'error') return <Screen><ErrorState error={versions.error} onRetry={versions.reload} /></Screen>;
  return <Report run={run} version={versions.data.find((v) => v.version === run.version) ?? null} />;
}

function Report({ run, version }: { readonly run: BacktestRun; readonly version: StrategyVersion | null }) {
  const { spacing } = useTheme();
  const r = run.result;
  const m = r.metrics;
  const stale = staleRunNote(r.engineVersion, r.resultSchemaVersion);
  const skipped = Object.entries(r.skipped).filter(([, n]) => (n ?? 0) > 0);
  return (
    <Screen testID="result-screen">
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title">{version ? `${version.name} v${version.version}` : `Strategy version ${run.version}`}</AppText>
        <SimulatedBadge kind="backtest" testID="result-badge" />
      </View>
      <AppText color="textSecondary">{`${r.dataLabel}${run.inputs.dataset.datasetId ? '' : ` · seed ${run.inputs.dataset.seed}`} · ${r.candles.toLocaleString('en-US')} ${run.inputs.dataset.timeframe} candles · run ${formatInTimeZone(run.createdAt, 'UTC')}`}</AppText>
      <Notice title={run.inputs.dataset.datasetId ? 'Results on past real data' : 'Simulated results'}>{`${r.dataDescription} ${PROCESS_NOTE}`}</Notice>
      {stale ? <Notice title="Older run" tone="warning">{stale}</Notice> : null}
      {r.warnings.length > 0 ? (
        <Notice title="Read these first" tone="warning">
          {r.warnings.map((w) => `• ${w}`).join('\n')}
        </Notice>
      ) : null}

      <ResultMetrics metrics={m} />
      <ResultCurves equity={r.equityCurve} drawdown={r.drawdownCurve} startingCapital={m.startingCapital} finalEquity={m.finalEquity} maxDrawdown={m.maxDrawdown} />
      <ConventionsCard conventions={r.conventions} footnote={`Engine v${r.engineVersion} · input hash ${run.inputHash} · result ${r.fingerprint} · ${r.warmup} warm-up candles`} />

      {r.split.length > 0 ? (
        <Card>
          <CardHeader icon={GitBranch} title={splitHeading(run.inputs.split.kind)} badge="backtest" />
          {r.split.map((p) => (
            <AppText key={p.label} testID="split-row">{`${p.label} (candles ${p.fromIndex}–${p.toIndex}): ${statsLine(p)}`}</AppText>
          ))}
          {r.splitExcluded > 0 ? (
            <AppText variant="caption" color="textSecondary" testID="split-excluded">{`${r.splitExcluded} trade${r.splitExcluded === 1 ? '' : 's'} crossed a boundary and ${r.splitExcluded === 1 ? 'is' : 'are'} left out of every part above.`}</AppText>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader icon={Layers} title="By market regime" badge="backtest" />
        <AppText variant="caption" color="textSecondary">{REGIME_NOTE}</AppText>
        {r.byRegime.map((g) => (
          <AppText key={g.regime} testID="regime-row">{`${REGIME_LABELS[g.regime]}: ${statsLine(g)}`}</AppText>
        ))}
      </Card>

      {skipped.length > 0 ? (
        <Card>
          <CardHeader icon={TriangleAlert} tone="warning" title="Signals not traded" />
          {skipped.map(([reason, n]) => (
            <AppText key={reason}>{`${SKIP_LABELS[reason as keyof typeof SKIP_LABELS] ?? reason}: ${n}`}</AppText>
          ))}
        </Card>
      ) : null}

      <Reproduce run={run} version={version} />
      {version ? <Sensitivity run={run} version={version} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button label="Compare runs" variant="secondary" onPress={() => router.push({ pathname: '/backtest/compare', params: { ids: run.id } })} />
        <Button label="Playbook" variant="secondary" onPress={() => router.push({ pathname: '/backtest/playbook/[id]', params: { id: run.strategyId } })} />
        <Button label="Strategy" variant="secondary" onPress={() => router.push({ pathname: '/backtest/strategy/[id]', params: { id: run.strategyId } })} />
      </View>

    </Screen>
  );
}

function Reproduce({ run, version }: { readonly run: BacktestRun; readonly version: StrategyVersion | null }) {
  const { spacing } = useTheme();
  const { state, start } = useRerun(run, version);
  return (
    <Card liveRegion>
      <CardHeader icon={Repeat} title="Trades" badge="backtest" />
      <AppText color="textSecondary">Trades are not stored: the run is repeated from its inputs, which also checks that it gives the same answer.</AppText>
      {state.status === 'idle' ? <Button label="Repeat the run and list trades" variant="secondary" onPress={() => void start()} disabled={!version} disabledReason="The strategy version this run used is no longer on this device." /> : null}
      {state.status === 'running' ? <AppText>{`Repeating… ${Math.round(state.progress * 100)}%`}</AppText> : null}
      {state.status === 'error' ? <Notice live title="Could not repeat the run" tone="warning">{errorText(state.error)}</Notice> : null}
      {state.status === 'done' ? (
        <>
          <Notice live title={state.reproduced ? 'Same result' : 'Different result'} tone={state.reproduced ? 'success' : 'warning'}>
            {state.reproduced ? 'The repeated run matched the saved one exactly.' : 'The repeated run did not match the saved one. The engine may have changed since it was saved.'}
          </Notice>
          {state.result.trades.slice(0, 50).map((t, i) => {
            const net = t.net.toDecimalPlaces(2).toNumber();
            const direction = directionOf(net, 2);
            return (
              <View key={i} testID="trade-row" style={{ gap: spacing.xxs }}>
                <AppText variant="caption" tabular>{`${i + 1}. ${t.side === 'buy' ? 'Long' : 'Short'} ${t.size.toString()} · candles ${t.entryIndex}→${t.exitIndex} · ${t.entry.toString()} → ${t.exit.toString()} · ${t.reason.replace(/_/g, ' ')}`}</AppText>
                <PnLValue direction={direction} amount={formatUsd(Math.abs(net))} r={`${t.r.abs().toDecimalPlaces(2).toString()}R`} subject={`Trade ${i + 1} result, backtest`} variant="caption" />
              </View>
            );
          })}
          {state.result.trades.length > 50 ? <AppText variant="caption" color="textSecondary">{`…and ${state.result.trades.length - 50} more.`}</AppText> : null}
        </>
      ) : null}
    </Card>
  );
}

function Sensitivity({ run, version }: { readonly run: BacktestRun; readonly version: StrategyVersion }) {
  const params = sensitivityParameters(version.definition);
  const [picked, setPicked] = useState(params[0]?.id ?? '');
  const { state, start } = useSensitivity(run, version);
  const parameter = params.find((p) => p.id === picked);
  if (params.length === 0) return null;
  return (
    <Card liveRegion>
      <CardHeader icon={Gauge} title="Parameter sensitivity" badge="backtest" />
      <AppText color="textSecondary">Reruns this test with one setting moved to nearby values. Robust rules give similar results; if only one exact value works, it was probably fitted to this data. Variants are not saved.</AppText>
      <ChoiceChips label="Setting" single options={params.map((p) => ({ value: p.id, label: p.label }))} selected={[picked]} onChange={(v) => v[0] && setPicked(v[0])} />
      <Button label="Run sensitivity check" variant="secondary" onPress={() => parameter && void start(parameter)} disabled={!parameter || state.status === 'running'} />
      {state.status === 'running' ? <AppText>{`Running ${state.done + 1} of ${state.total}…`}</AppText> : null}
      {state.status === 'error' ? <Notice live title="The check did not run" tone="warning">{errorText(state.error)}</Notice> : null}
      {state.status === 'done'
        ? state.rows.map((row) => (
            <AppText key={row.value} testID="sensitivity-row">
              {`${state.parameter.label} ${row.value}${row.isBase ? ' (current)' : ''}: ${
                row.invalid !== null ? `n/a (${row.invalid})` : `${row.trades ?? 0} trades · ${row.expectancyR === null ? 'n/a' : signedR(row.expectancyR)} · max drawdown ${formatPercent(row.maxDrawdown)}`
              }`}
            </AppText>
          ))
        : null}
    </Card>
  );
}
