import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Card, EmptyState, ErrorState, ListRow, ListScreen, LoadingState, Notice, Screen } from '../../../components/ui';
import { definitionChanges, describeStrategy, MANY_VERSIONS, statsLine, templateFor, useRuns, useStrategyVersions, type BacktestRun, type StrategyVersion } from '../../../features/backtest';
import { formatInTimeZone } from '../../../shared/time';
import { CardHeader } from '../../../components/ui/CardHeader';
import { BookOpen, GitBranch } from '../../../components/ui/icons';
import { useTheme } from '../../../theme';

/** One of the learner's strategies: its rules, every version with what changed, and its runs. */
export default function MyStrategyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const versions = useStrategyVersions(id ?? null);
  const runs = useRuns(id ?? null);
  const [open, setOpen] = useState<number | null>(null);
  if (versions.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (versions.status === 'error') return <Screen><ErrorState error={versions.error} onRetry={versions.reload} /></Screen>;
  const latest = versions.data[0];
  if (!latest) return <Screen><EmptyState title="Strategy not found" body="It may have been removed by restoring a backup." actionLabel="Back" onAction={() => router.back()} /></Screen>;
  const shown = open === null ? latest : (versions.data.find((v) => v.version === open) ?? latest);
  return <StrategyBody versions={versions.data} latest={latest} shown={shown} runs={runs} onShow={setOpen} />;
}

const NO_RUNS: readonly BacktestRun[] = [];

interface StrategyBodyProps {
  readonly versions: readonly StrategyVersion[];
  readonly latest: StrategyVersion;
  readonly shown: StrategyVersion;
  readonly runs: ReturnType<typeof useRuns>;
  readonly onShow: (version: number) => void;
}

function StrategyBody({ versions, latest, shown, runs, onShow }: StrategyBodyProps) {
  const { spacing } = useTheme();
  const template = latest.templateId ? templateFor(latest.templateId) : null;
  const rules = useMemo(() => describeStrategy(shown.definition), [shown.definition]);
  return (
    <ListScreen
      testID="my-strategy-screen"
      header={
        <>
          <AppText variant="title">{latest.name}</AppText>
          <AppText color="textSecondary">{`Version ${latest.version}${template ? ` · your copy of “${template.name}”` : ''}`}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Button label="Run a backtest" onPress={() => router.push({ pathname: '/backtest/run', params: { strategyId: latest.strategyId } })} />
            <Button label="Edit (new version)" variant="secondary" onPress={() => router.push({ pathname: '/backtest/builder', params: { strategyId: latest.strategyId } })} />
            <Button label="Playbook" variant="secondary" onPress={() => router.push({ pathname: '/backtest/playbook/[id]', params: { id: latest.strategyId } })} />
          </View>
          {versions.length >= MANY_VERSIONS ? (
            <Notice title="Many versions" tone="warning">
              {`You have saved ${versions.length} versions. Each change tuned on the same data makes it more likely the rules only fit that data. Test new versions on a different seed before trusting them.`}
            </Notice>
          ) : null}
          <Card>
            <CardHeader icon={BookOpen} title={`Rules (v${shown.version})`} />
            {rules.map((line) => (
              <AppText key={line}>{line}</AppText>
            ))}
          </Card>
          <Card>
            <CardHeader icon={GitBranch} title="Version history" />
            {versions.map((v, i) => (
              <VersionRow key={v.version} version={v} previous={versions[i + 1] ?? null} onShow={() => onShow(v.version)} selected={shown.version === v.version} />
            ))}
          </Card>
          <AppText variant="heading">Runs</AppText>
          {runs.status === 'loading' ? <LoadingState /> : null}
          {runs.status === 'error' ? <ErrorState error={runs.error} onRetry={runs.reload} /> : null}
        </>
      }
      data={runs.status === 'success' ? runs.data : NO_RUNS}
      keyExtractor={(r) => r.id}
      renderItem={(r) => (
        <ListRow
          testID="strategy-run"
          title={`v${r.version} · seed ${r.inputs.dataset.seed} · ${r.inputs.dataset.candles} candles · ${formatInTimeZone(r.createdAt, 'UTC')}`}
          subtitle={statsLine(r.result.metrics)}
          onPress={() => router.push({ pathname: '/backtest/result/[id]', params: { id: r.id } })}
        />
      )}
      empty={runs.status === 'success' ? <AppText color="textSecondary">No backtests yet.</AppText> : null}
    />
  );
}

interface VersionRowProps {
  readonly version: StrategyVersion;
  readonly previous: StrategyVersion | null;
  readonly selected: boolean;
  readonly onShow: () => void;
}

function VersionRow({ version: v, previous, selected, onShow }: VersionRowProps) {
  const changes = previous ? definitionChanges(previous.definition, v.definition) : [];
  return (
    <View testID="version-row">
      <ListRow title={`v${v.version}${selected ? ' (shown above)' : ''} · ${formatInTimeZone(v.createdAt, 'UTC')}`} subtitle={v.note || (previous ? `${changes.length} setting${changes.length === 1 ? '' : 's'} changed` : 'First version')} onPress={onShow} />
      {changes.map((c) => (
        <AppText key={c.path} variant="caption" color="textSecondary">{`  ${c.path}: ${c.before} → ${c.after}`}</AppText>
      ))}
      {previous && previous.name !== v.name ? <AppText variant="caption" color="textSecondary">{`  name: ${previous.name} → ${v.name}`}</AppText> : null}
    </View>
  );
}
