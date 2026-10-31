import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, ChoiceChips, EmptyState, ErrorState, ListRow, LoadingState, Notice, Screen, TextField } from '../../../components/ui';
import {
  definitionChanges,
  describeStrategy,
  MAX_PLAYBOOK_TEXT,
  statsLine,
  templateFor,
  usePlaybook,
  useRuns,
  useStrategyActions,
  useStrategyVersions,
  type BacktestRun,
  type PlaybookEntry,
  type StrategyVersion,
} from '../../../features/backtest';
import { CardHeader } from '../../../components/ui/CardHeader';
import { BookOpen, ChartColumn, GitBranch } from '../../../components/ui/icons';
import { useStrategyContent } from '../../../features/strategies';
import { errorText } from '../../../shared/errors';
import { formatInTimeZone } from '../../../shared/time';
import { canOpen } from '../../../shared/routeAccess';

/** Personal Trading Playbook (spec §16.5): why the strategy should work, when it applies, what breaks it, and the evidence from your own runs. */
export default function PlaybookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const versions = useStrategyVersions(id ?? null);
  const runs = useRuns(id ?? null);
  const entry = usePlaybook(id ?? '');
  for (const q of [versions, runs, entry]) {
    if (q.status === 'loading') return <Screen><LoadingState /></Screen>;
    if (q.status === 'error') return <Screen><ErrorState error={q.error} onRetry={q.reload} /></Screen>;
  }
  if (versions.status !== 'success' || runs.status !== 'success' || entry.status !== 'success') return null;
  const latest = versions.data[0];
  if (!latest) return <Screen><EmptyState title="Strategy not found" body="Save a strategy before writing its playbook." actionLabel="Back" onAction={() => router.back()} /></Screen>;
  return <Playbook versions={versions.data} latest={latest} runs={runs.data} entry={entry.data} />;
}

interface PlaybookProps {
  readonly versions: readonly StrategyVersion[];
  readonly latest: StrategyVersion;
  readonly runs: readonly BacktestRun[];
  readonly entry: PlaybookEntry | null;
}

function Playbook({ versions, latest, runs, entry }: PlaybookProps) {
  const content = useStrategyContent();
  const { savePlaybook } = useStrategyActions();
  const template = latest.templateId ? templateFor(latest.templateId) : null;
  const libraryPage = latest.templateId ? content.strategy(latest.templateId) : null;
  // Only reviewed sources are ever shown (spec §15.1).
  const sources = (libraryPage?.sourceIds ?? []).flatMap((sid) => {
    const s = content.reviewedSource(sid);
    return s ? [s] : [];
  });
  const [hypothesis, setHypothesis] = useState(entry?.hypothesis ?? '');
  const [conditions, setConditions] = useState(entry?.conditions ?? '');
  const [invalidation, setInvalidation] = useState(entry?.invalidation ?? '');
  const [limitations, setLimitations] = useState(entry?.limitations ?? (template ? template.simplifications.join(' ') : ''));
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [runId, setRunId] = useState<string | null>(entry?.runId && runs.some((r) => r.id === entry.runId) ? entry.runId : null);
  const [status, setStatus] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const linked = runs.find((r) => r.id === runId) ?? null;

  const save = async () => {
    const r = await savePlaybook({ strategyId: latest.strategyId, hypothesis, conditions, invalidation, limitations, notes, runId });
    setStatus(r.ok ? { tone: 'success', text: 'Playbook saved.' } : { tone: 'warning', text: errorText(r.error) });
  };

  return (
    <Screen testID="playbook-screen">
      <AppText variant="title">{`Playbook: ${latest.name}`}</AppText>
      <AppText color="textSecondary">Your own notes. The rules below come from the saved strategy, so they always match what was tested.</AppText>
      <TextField label="Hypothesis: what should these rules capture, and why?" value={hypothesis} onChangeText={setHypothesis} multiline maxLength={MAX_PLAYBOOK_TEXT} testID="playbook-hypothesis" />
      <TextField label="Market conditions where it should work" value={conditions} onChangeText={setConditions} multiline maxLength={MAX_PLAYBOOK_TEXT} />
      <TextField label="Invalidation: what would show the idea is wrong?" value={invalidation} onChangeText={setInvalidation} multiline maxLength={MAX_PLAYBOOK_TEXT} />

      <Card>
        <CardHeader icon={BookOpen} title={`Entry, exit, risk and sizing (v${latest.version})`} />
        {describeStrategy(latest.definition).map((line) => (
          <AppText key={line}>{line}</AppText>
        ))}
      </Card>

      <Card>
        <CardHeader icon={ChartColumn} title="Results" badge="backtest" />
        {runs.length === 0 ? <AppText color="textSecondary">No runs yet. Run a backtest to link its results here.</AppText> : null}
        {runs.length > 0 ? (
          <ChoiceChips
            label="Linked run"
            single
            options={runs.map((r) => ({ value: r.id, label: `v${r.version} · seed ${r.inputs.dataset.seed} · ${formatInTimeZone(r.createdAt, 'UTC')}` }))}
            selected={runId ? [runId] : []}
            onChange={(v) => setRunId(v[0] ?? null)}
          />
        ) : null}
        {linked ? (
          <>
            <AppText>{`All candles: ${statsLine(linked.result.metrics)} · max drawdown ${linked.result.metrics.maxDrawdown}%`}</AppText>
            {linked.result.split.map((p) => (
              <AppText key={p.label} testID="playbook-split">{`${p.label}: ${statsLine(p)}`}</AppText>
            ))}
            {linked.version !== latest.version ? <AppText color="textSecondary">{`This run tested v${linked.version}; the rules above are v${latest.version}.`}</AppText> : null}
            <ListRow title="Open the full report" onPress={() => router.push({ pathname: '/backtest/result/[id]', params: { id: linked.id } })} />
          </>
        ) : null}
      </Card>

      <TextField label="Limitations" value={limitations} onChangeText={setLimitations} multiline maxLength={MAX_PLAYBOOK_TEXT} hint="Include that results come from simulated data." />
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={MAX_PLAYBOOK_TEXT} />
      {status ? <Notice live title={status.tone === 'success' ? 'Saved' : 'Not saved'} tone={status.tone}>{status.text}</Notice> : null}
      <Button label="Save playbook" onPress={() => void save()} />

      <Card>
        <CardHeader icon={GitBranch} title="Version history" />
        {versions.map((v, i) => {
          const prev = versions[i + 1];
          const changes = prev ? definitionChanges(prev.definition, v.definition) : [];
          return (
            <AppText key={v.version} variant="caption" testID="playbook-version">
              {`v${v.version} · ${formatInTimeZone(v.createdAt, 'UTC')}${v.note ? ` · ${v.note}` : ''}${prev ? (changes.length ? `\n${changes.map((c) => `  ${c.path}: ${c.before} → ${c.after}`).join('\n')}` : '\n  no rule changes') : '\n  first version'}`}
            </AppText>
          );
        })}
      </Card>

      {libraryPage ? (
        <Card>
          <AppText variant="heading">Background</AppText>
          {canOpen('/strategy/[id]') ? (
            <ListRow title={libraryPage.title} subtitle="The Strategy Library page this started from" onPress={() => router.push({ pathname: '/strategy/[id]', params: { id: libraryPage.id } })} />
          ) : (
            <AppText>{libraryPage.title}</AppText>
          )}
          {sources.map((s) => (
            <AppText key={s.id} variant="caption" color="textSecondary">{`• ${s.title}${s.author ? `, ${s.author}` : ''}`}</AppText>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
