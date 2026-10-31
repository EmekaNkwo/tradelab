import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppText, Button, Card, ChoiceChips, EmptyState, ErrorState, LoadingState, Notice, Screen, SegmentedControl, TextField } from '../../components/ui';
import { Stepper } from '../../components/backtest/Stepper';
import {
  BACKTEST_CONVENTIONS,
  conventionsFor,
  CANDLE_CHOICES,
  defaultRunForm,
  describeStrategy,
  runInputs,
  SIMULATED_DATA_LABEL,
  runContext,
  useBacktestRunner,
  useRuns,
  useStrategyVersions,
  type FormIssue,
  type RunContext,
  type RunForm,
  type StrategyVersion,
} from '../../features/backtest';
import { datasetsFor, ROUGH_ESTIMATE_NOTE, storedDatasetLabel, useDataset, useDatasets, usePriceFit } from '../../features/marketData';
import { errorText } from '../../shared/errors';

/** Set up and run a backtest (spec §16.3), with progress and Cancel. */
export default function RunScreen() {
  const { strategyId } = useLocalSearchParams<{ strategyId: string }>();
  const versions = useStrategyVersions(strategyId ?? null);
  const runs = useRuns(strategyId ?? null);
  if (versions.status === 'loading' || runs.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (versions.status === 'error') return <Screen><ErrorState error={versions.error} onRetry={versions.reload} /></Screen>;
  if (runs.status === 'error') return <Screen><ErrorState error={runs.error} onRetry={runs.reload} /></Screen>;
  const latest = versions.data[0];
  if (!latest) return <Screen><EmptyState title="Strategy not found" body="Save a strategy before running a backtest." actionLabel="Back" onAction={() => router.back()} /></Screen>;
  return <RunSetup version={latest} context={runContext(latest.version, versions.data.length, runs.data)} />;
}

const issueFor = (issues: readonly FormIssue[], field: keyof RunForm) => issues.find((i) => i.field === field)?.message ?? null;

function RunSetup({ version, context }: { readonly version: StrategyVersion; readonly context: RunContext }) {
  const [form, setForm] = useState<RunForm>(() => defaultRunForm(version.definition));
  const [issues, setIssues] = useState<readonly FormIssue[]>([]);
  const { state, start, cancel } = useBacktestRunner();
  const set = (patch: Partial<RunForm>) => setForm({ ...form, ...patch });
  const running = state.status === 'running';
  const datasets = useDatasets();
  const usable = datasets.status === 'success' ? datasetsFor(datasets.data, version.definition.instrumentId, version.definition.timeframe) : [];
  // The effective data set is the one resolved from storage, never the raw selection.
  const chosen = usable.find((d) => d.id === form.datasetId) ?? null;
  const loaded = useDataset(chosen?.id ?? null);
  const fit = usePriceFit(loaded.status === 'success' && loaded.data ? loaded.data.candles : null, version.definition.instrumentId);
  const [vanished, setVanished] = useState<string | null>(null);

  // Adjusted during render (not in an effect) so the form is never shown with a stale choice.
  // The chosen data set was deleted while the screen was open: go back to simulated data and say so.
  if (datasets.status === 'success' && form.datasetId !== null && !chosen) {
    setVanished(form.datasetId);
    setForm({ ...form, datasetId: null, costsConfirmed: false });
  }
  // Choosing real data whose price level does not fit the practice market pre-fills scaled cost estimates, once per choice.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (chosen && fit && prefilledFor !== chosen.id) {
    setPrefilledFor(chosen.id);
    if (!fit.fits) setForm({ ...form, spread: fit.estimatedSpread, slippage: fit.estimatedSlippage });
  }

  useEffect(() => {
    if (state.status === 'done') router.replace({ pathname: '/backtest/result/[id]', params: { id: state.run.id } });
  }, [state]);

  const run = () => {
    const inputs = runInputs(version.definition, form, context, chosen ? { id: chosen.id, candleCount: chosen.candleCount, contentHash: chosen.contentHash, label: storedDatasetLabel(chosen) } : null);
    if (!inputs.ok) return setIssues(inputs.error);
    setIssues([]);
    void start(version, inputs.value);
  };

  return (
    <Screen testID="run-screen">
      <AppText variant="title">{`Backtest ${version.name} v${version.version}`}</AppText>
      {chosen ? (
        <Notice title={storedDatasetLabel(chosen)}>{`Real past prices: ${chosen.candleCount.toLocaleString('en-US')} ${chosen.timeframe} candles from ${chosen.first.slice(0, 10)} to ${chosen.last.slice(0, 10)}. Contract terms and default costs are the practice market’s teaching examples. Past results on real data do not predict future results.`}</Notice>
      ) : (
        <Notice title={SIMULATED_DATA_LABEL}>The candles come from a seeded generator that strings together trending, ranging and volatile stretches. The same seed always gives the same candles, so the same setup always gives the same result.</Notice>
      )}
      {vanished ? (
        <Notice title="Back to simulated data" tone="warning">
          The data you chose is no longer on this device, so simulated data is selected again.
        </Notice>
      ) : null}
      <Card>
        {describeStrategy(version.definition).map((line) => (
          <AppText key={line} variant="caption">{line}</AppText>
        ))}
      </Card>
      <Card>
        <AppText variant="heading">Data</AppText>
        {usable.length > 0 ? (
          <ChoiceChips
            label="Candles from"
            single
            options={[{ value: 'simulated', label: SIMULATED_DATA_LABEL }, ...usable.map((d) => ({ value: d.id, label: storedDatasetLabel(d) }))]}
            selected={[form.datasetId ?? 'simulated']}
            onChange={(v) => {
              if (!v[0]) return;
              setVanished(null);
              set({ datasetId: v[0] === 'simulated' ? null : v[0], costsConfirmed: false });
            }}
          />
        ) : null}
        {chosen ? null : (
          <>
        <TextField label="Seed" value={form.seed} onChangeText={(seed) => set({ seed })} keyboardType="numbers-and-punctuation" error={issueFor(issues, 'seed')} hint="Any whole number. A different seed gives different simulated data." testID="run-seed" />
        <ChoiceChips label="Candles" single options={CANDLE_CHOICES.map((n) => ({ value: n, label: n.toLocaleString('en-US') }))} selected={[Number(form.candles)]} onChange={(v) => v[0] && set({ candles: String(v[0]) })} />
        {issueFor(issues, 'candles') ? <AppText color="lossText">{issueFor(issues, 'candles')}</AppText> : null}
          </>
        )}
        {issueFor(issues, 'datasetId') ? <AppText color="lossText">{issueFor(issues, 'datasetId')}</AppText> : null}
      </Card>
      <Card>
        <AppText variant="heading">Capital and costs</AppText>
        {chosen && fit && !fit.fits ? (
          <Notice title="The default costs do not fit this market" tone="warning">
            <AppText testID="price-fit-warning">{`${fit.warning ?? ''} The spread and slippage below were scaled to this price level. ${ROUGH_ESTIMATE_NOTE}`}</AppText>
          </Notice>
        ) : null}
        <TextField label="Starting capital (USD)" value={form.capital} onChangeText={(capital) => set({ capital })} keyboardType="decimal-pad" error={issueFor(issues, 'capital')} testID="run-capital" />
        <TextField label="Spread (price units)" value={form.spread} onChangeText={(spread) => set({ spread })} keyboardType="decimal-pad" error={issueFor(issues, 'spread')} testID="run-spread" />
        <TextField label="Slippage per market or stop fill (price units)" value={form.slippage} onChangeText={(slippage) => set({ slippage })} keyboardType="decimal-pad" error={issueFor(issues, 'slippage')} />
        <TextField label="Commission per side, per lot or unit (USD)" value={form.commissionPerSide} onChangeText={(commissionPerSide) => set({ commissionPerSide })} keyboardType="decimal-pad" error={issueFor(issues, 'commissionPerSide')} />
        <TextField label="Swap per lot or unit per day, long (USD; negative is a charge)" value={form.swapLong} onChangeText={(swapLong) => set({ swapLong })} keyboardType="numbers-and-punctuation" error={issueFor(issues, 'swapLong')} />
        <TextField label="Swap per lot or unit per day, short (USD; negative is a charge)" value={form.swapShort} onChangeText={(swapShort) => set({ swapShort })} keyboardType="numbers-and-punctuation" error={issueFor(issues, 'swapShort')} />
        {chosen ? (
          <>
            <SegmentedControl
              label="I have checked the spread and slippage for this market"
              options={[{ value: 'no', label: 'Not yet' }, { value: 'yes', label: 'Checked' }]}
              value={form.costsConfirmed ? 'yes' : 'no'}
              onChange={(v) => set({ costsConfirmed: v === 'yes' })}
            />
            {issueFor(issues, 'costsConfirmed') ? <AppText color="lossText" testID="costs-confirm-issue">{issueFor(issues, 'costsConfirmed')}</AppText> : null}
          </>
        ) : null}
        <AppText variant="caption" color="textSecondary">The defaults are the practice market’s own costs. Setting a cost to zero is allowed, but the report will warn that it flatters the results.</AppText>
      </Card>
      <Card>
        <AppText variant="heading">Out-of-sample test</AppText>
        <SegmentedControl
          label="Split"
          options={[{ value: 'holdout', label: 'Holdout' }, { value: 'walk_forward', label: 'Period blocks' }, { value: 'none', label: 'None' }]}
          value={form.split.kind}
          onChange={(kind) => set({ split: kind === 'holdout' ? { kind, inSamplePercent: 70 } : kind === 'walk_forward' ? { kind, folds: 4 } : { kind } })}
        />
        {form.split.kind === 'holdout' ? (
          <Stepper label="In-sample %" value={form.split.inSamplePercent} step={5} min={30} max={90} onChange={(inSamplePercent) => set({ split: { kind: 'holdout', inSamplePercent } })} format={(v) => `${v}%`} />
        ) : null}
        {form.split.kind === 'walk_forward' ? <Stepper label="Blocks" value={form.split.folds} step={1} min={2} max={10} onChange={(folds) => set({ split: { kind: 'walk_forward', folds } })} /> : null}
        <AppText variant="caption" color="textSecondary">
          {form.split.kind === 'holdout'
            ? 'Results are reported separately for the first part (in-sample) and the rest (out-of-sample). Rules that only work in-sample were probably fitted to it.'
            : form.split.kind === 'walk_forward'
              ? 'Period blocks (no refitting): the same rules are judged on each block of time in turn, to show whether results hold across periods. Nothing is re-tuned between blocks.'
              : 'Every candle is judged at once. The report will say there was no out-of-sample test.'}
        </AppText>
      </Card>
      {state.status === 'running' ? (
        <Card liveRegion>
          <AppText testID="run-progress" accessibilityLiveRegion="polite">{`Running… ${Math.round(state.progress * 100)}%`}</AppText>
          <Button label="Cancel" variant="secondary" onPress={cancel} />
        </Card>
      ) : null}
      {state.status === 'cancelled' ? <Notice live title="Cancelled">The backtest stopped and nothing was saved.</Notice> : null}
      {state.status === 'error' ? <Notice live title="The backtest did not run" tone="warning">{errorText(state.error)}</Notice> : null}
      <Button label="Run backtest" onPress={run} disabled={running} busy={running} />
      <Card>
        <AppText variant="heading">How fills work</AppText>
        {(chosen ? conventionsFor('user_import') : BACKTEST_CONVENTIONS).map((c) => (
          <AppText key={c} variant="caption" color="textSecondary">{`• ${c}`}</AppText>
        ))}
      </Card>
    </Screen>
  );
}
