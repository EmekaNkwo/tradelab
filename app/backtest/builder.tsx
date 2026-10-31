import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { GroupEditor } from '../../components/backtest/RuleEditor';
import { Stepper } from '../../components/backtest/Stepper';
import { AppText, Button, Card, ChoiceChips, EmptyState, ErrorState, LoadingState, Notice, Screen, SegmentedControl, TextField } from '../../components/ui';
import {
  addCondition,
  BACKTEST_TIMEFRAMES,
  blankDefinition,
  DEFINITION_LIMITS as L,
  definitionChanges,
  definitionIssues,
  describeStrategy,
  forSaving,
  GROUP_KEYS,
  GROUP_TITLES,
  MAX_STRATEGY_NAME,
  MAX_VERSION_NOTE,
  removeCondition,
  setCondition,
  setJoin,
  templateFor,
  useStrategyActions,
  useStrategyVersions,
  withDirection,
  type StrategyDefinition,
  type StrategyVersion,
} from '../../features/backtest';
import { PRACTICE_INSTRUMENTS } from '../../features/paper';
import { errorText } from '../../shared/errors';
import { CardHeader } from '../../components/ui/CardHeader';
import { BookOpen } from '../../components/ui/icons';
import { useTheme } from '../../theme';

/** Strategy Builder (spec §16.2): tappable rule blocks, a plain-English summary, strict checks, and a new version on every save. */
export default function BuilderScreen() {
  const { strategyId, template } = useLocalSearchParams<{ strategyId?: string; template?: string }>();
  const versions = useStrategyVersions(strategyId ?? null);
  if (strategyId) {
    if (versions.status === 'loading') return <Screen><LoadingState /></Screen>;
    if (versions.status === 'error') return <Screen><ErrorState error={versions.error} onRetry={versions.reload} /></Screen>;
    const latest = versions.data[0];
    if (!latest) return <Screen><EmptyState title="Strategy not found" body="It may have been removed by restoring a backup." actionLabel="Back" onAction={() => router.back()} /></Screen>;
    return <Builder key={`${latest.strategyId}-${latest.version}`} latest={latest} templateId={latest.templateId} initial={latest.definition} initialName={latest.name} />;
  }
  const t = template ? templateFor(template) : null;
  if (template && !t) return <Screen><EmptyState title="Template not found" body="This strategy has no builder version." actionLabel="Back" onAction={() => router.back()} /></Screen>;
  return <Builder latest={null} templateId={t?.strategyId ?? null} initial={t?.definition ?? blankDefinition()} initialName={t ? `My ${t.name}` : ''} simplifications={t?.simplifications} />;
}

interface BuilderProps {
  readonly latest: StrategyVersion | null;
  readonly templateId: string | null;
  readonly initial: StrategyDefinition;
  readonly initialName: string;
  readonly simplifications?: readonly string[];
}

function Builder({ latest, templateId, initial, initialName, simplifications }: BuilderProps) {
  const { spacing } = useTheme();
  const { saveVersion } = useStrategyActions();
  const [d, setD] = useState<StrategyDefinition>(initial);
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saved = useMemo(() => forSaving(d), [d]);
  const issues = useMemo(() => definitionIssues(saved), [saved]);
  const changes = useMemo(() => (latest ? definitionChanges(latest.definition, saved) : []), [latest, saved]);
  const instrument = PRACTICE_INSTRUMENTS.find((i) => i.id === d.instrumentId);
  const nameError = name.trim().length === 0 ? 'Give the strategy a name' : null;
  const unchanged = latest !== null && changes.length === 0 && name.trim() === latest.name && note.trim() === latest.note;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const r = await saveVersion({ strategyId: latest?.strategyId ?? null, name, definition: saved, templateId, note });
    setSaving(false);
    if (!r.ok) return setSaveError(errorText(r.error));
    router.replace({ pathname: '/backtest/strategy/[id]', params: { id: r.value.strategyId } });
  };

  return (
    <Screen testID="builder-screen">
      <AppText variant="title">{latest ? `${latest.name} · editing v${latest.version}` : 'New strategy'}</AppText>
      {templateId && !latest ? (
        <Notice title="Your own copy">
          {`This starts as a copy of a Strategy Library example. Saving makes it your strategy; the library page never changes.${
            simplifications && simplifications.length > 0 ? ` The builder version simplifies the page's rules: ${simplifications.join(' ')}` : ''
          }`}
        </Notice>
      ) : null}
      {latest ? <AppText color="textSecondary">Saving adds a new version. Earlier versions and their backtests are kept unchanged.</AppText> : null}
      <TextField label="Name" value={name} onChangeText={setName} maxLength={MAX_STRATEGY_NAME} error={nameError} testID="builder-name" />

      <Card>
        <AppText variant="heading">Market and timeframe</AppText>
        <ChoiceChips label="Practice market" single options={PRACTICE_INSTRUMENTS.map((i) => ({ value: i.id, label: i.name }))} selected={[d.instrumentId]} onChange={(v) => v[0] && setD({ ...d, instrumentId: v[0] })} />
        <ChoiceChips label="Timeframe" single options={BACKTEST_TIMEFRAMES.map((t) => ({ value: t, label: t }))} selected={[d.timeframe]} onChange={(v) => v[0] && setD({ ...d, timeframe: v[0] })} />
        <SegmentedControl
          label="Direction"
          options={[{ value: 'long', label: 'Long' }, { value: 'short', label: 'Short' }, { value: 'both', label: 'Both' }]}
          value={d.direction}
          onChange={(direction) => setD(withDirection(d, direction))}
        />
        {instrument && !instrument.allowShort ? <AppText variant="caption" color="textSecondary">This market cannot be sold short in practice, so only long rules apply.</AppText> : null}
      </Card>

      {GROUP_KEYS.filter((k) => (k.startsWith('long') ? d.direction !== 'short' : d.direction !== 'long')).map((k) => (
        <Card key={k}>
          <GroupEditor
            title={GROUP_TITLES[k]}
            group={d[k]}
            testID={`group-${k}`}
            onJoin={(join) => setD(setJoin(d, k, join))}
            onCondition={(i, c) => setD(setCondition(d, k, i, c))}
            onRemove={(i) => setD(removeCondition(d, k, i))}
            onAdd={() => setD(addCondition(d, k))}
          />
          {k.endsWith('Exit') ? <AppText variant="caption" color="textSecondary">Optional: trades also close at the stop or target.</AppText> : null}
        </Card>
      ))}

      <Card>
        <AppText variant="heading">Stop, target and size</AppText>
        <SegmentedControl
          label="Stop loss"
          options={[{ value: 'atr', label: 'ATR' }, { value: 'percent', label: 'Percent' }, { value: 'channel', label: 'Channel' }]}
          value={d.stop.kind}
          onChange={(kind) => setD({ ...d, stop: kind === 'atr' ? { kind, period: 14, multiple: 2 } : kind === 'percent' ? { kind, percent: 1 } : { kind, period: 10 } })}
        />
        {d.stop.kind === 'atr' ? (
          <>
            <Stepper label="ATR period" value={d.stop.period} step={1} min={L.period.min} max={L.period.max} onChange={(period) => d.stop.kind === 'atr' && setD({ ...d, stop: { ...d.stop, period } })} />
            <Stepper label="ATR multiple" value={d.stop.multiple} step={0.5} min={L.atrMultiple.min} max={L.atrMultiple.max} onChange={(multiple) => d.stop.kind === 'atr' && setD({ ...d, stop: { ...d.stop, multiple } })} testID="stop-multiple" />
          </>
        ) : null}
        {d.stop.kind === 'percent' ? (
          <Stepper label="Distance %" value={d.stop.percent} step={0.1} min={L.stopPercent.min} max={L.stopPercent.max} onChange={(percent) => setD({ ...d, stop: { kind: 'percent', percent } })} />
        ) : null}
        {d.stop.kind === 'channel' ? (
          <Stepper label="Channel candles" value={d.stop.period} step={1} min={L.period.min} max={L.period.max} onChange={(period) => setD({ ...d, stop: { kind: 'channel', period } })} />
        ) : null}
        <SegmentedControl
          label="Take profit"
          options={[{ value: 'none', label: 'None' }, { value: 'r_multiple', label: 'R multiple' }]}
          value={d.target.kind}
          onChange={(kind) => setD({ ...d, target: kind === 'none' ? { kind } : { kind, r: 2 } })}
        />
        {d.target.kind === 'r_multiple' ? <Stepper label="Target (R)" value={d.target.r} step={0.5} min={L.targetR.min} max={L.targetR.max} onChange={(r) => setD({ ...d, target: { kind: 'r_multiple', r } })} /> : null}
        <Stepper label="Risk per trade %" value={d.riskPercent} step={0.1} min={L.riskPercent.min} max={L.riskPercent.max} onChange={(riskPercent) => setD({ ...d, riskPercent })} testID="risk-percent" />
        <AppText variant="caption" color="textSecondary">Size comes from the same risk engine as the position size calculator: the loss at the stop, costs included, stays within this %.</AppText>
      </Card>

      <Card>
        <AppText variant="heading">Risk limits and session</AppText>
        <Stepper label="Most new trades a day" value={d.limits.maxTradesPerDay} step={1} min={L.maxTradesPerDay.min} max={L.maxTradesPerDay.max} onChange={(maxTradesPerDay) => setD({ ...d, limits: { ...d.limits, maxTradesPerDay } })} />
        <OptionalStepper label="Stop for the day after losing %" value={d.limits.dailyLossPercent} start={2} step={0.5} range={L.dailyLossPercent} onChange={(dailyLossPercent) => setD({ ...d, limits: { ...d.limits, dailyLossPercent } })} />
        <OptionalStepper label="Pause after losses in a row" value={d.limits.pauseAfterLosses} start={3} step={1} range={L.pauseAfterLosses} onChange={(pauseAfterLosses) => setD({ ...d, limits: { ...d.limits, pauseAfterLosses } })} />
        <SegmentedControl
          label="Session filter"
          options={[{ value: 'off', label: 'Any time' }, { value: 'on', label: 'Set hours' }]}
          value={d.session ? 'on' : 'off'}
          onChange={(v) => setD({ ...d, session: v === 'on' ? { startHourUtc: 7, endHourUtc: 16 } : null })}
        />
        {d.session ? (
          <>
            <Stepper label="From (UTC hour)" value={d.session.startHourUtc} step={1} min={0} max={23} onChange={(startHourUtc) => d.session && setD({ ...d, session: { ...d.session, startHourUtc } })} />
            <Stepper label="Until (UTC hour)" value={d.session.endHourUtc} step={1} min={0} max={23} onChange={(endHourUtc) => d.session && setD({ ...d, session: { ...d.session, endHourUtc } })} />
          </>
        ) : null}
      </Card>

      <Card>
        <CardHeader icon={BookOpen} title="In plain English" />
        <View style={{ gap: spacing.xs }} testID="builder-summary">
          {describeStrategy(saved).map((line) => (
            <AppText key={line}>{line}</AppText>
          ))}
        </View>
      </Card>

      {issues.length > 0 ? (
        <Notice title="Fix these before saving" tone="warning">
          {issues.map((i) => `• ${i.message}`).join('\n')}
        </Notice>
      ) : null}

      {latest ? (
        <Card>
          <AppText variant="heading">{`Changes from v${latest.version}`}</AppText>
          {changes.length === 0 ? <AppText color="textSecondary">No rule changes yet.</AppText> : null}
          {changes.map((c) => (
            <AppText key={c.path} variant="caption" testID="builder-change">{`${c.path}: ${c.before} → ${c.after}`}</AppText>
          ))}
          <TextField label="What changed and why (optional)" value={note} onChangeText={setNote} maxLength={MAX_VERSION_NOTE} multiline />
        </Card>
      ) : null}

      {saveError ? <Notice live title="Not saved" tone="warning">{saveError}</Notice> : null}
      <Button
        label={latest ? `Save as v${latest.version + 1}` : 'Save strategy'}
        onPress={save}
        busy={saving}
        disabled={issues.length > 0 || nameError !== null || unchanged || saving}
        disabledReason={issues.length > 0 ? 'Fix the problems listed above first.' : nameError !== null ? 'Give the strategy a name first.' : unchanged ? 'Nothing has changed since the last version.' : undefined}
        accessibilityHint="Saves a new version; earlier versions stay as they were"
      />
    </Screen>
  );
}

interface OptionalStepperProps {
  readonly label: string;
  readonly value: number | null;
  readonly start: number;
  readonly step: number;
  readonly range: { readonly min: number; readonly max: number };
  readonly onChange: (value: number | null) => void;
}

function OptionalStepper({ label, value, start, step, range, onChange }: OptionalStepperProps) {
  return (
    <>
      <SegmentedControl label={label} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} value={value === null ? 'off' : 'on'} onChange={(v) => onChange(v === 'on' ? start : null)} />
      {value !== null ? <Stepper label={label} hideLabel value={value} step={step} min={range.min} max={range.max} onChange={onChange} /> : null}
    </>
  );
}
