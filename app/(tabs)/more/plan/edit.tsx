import { errorText } from '../../../../shared/errors';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { AppText, Button, Card, ChoiceChips, ErrorState, LoadingState, Notice, Screen, TextField } from '../../../../components/ui';
import {
  EMPTY_PLAN,
  formToPlan,
  PLAN_FIELD_LABELS,
  PLAN_LIMITS,
  planIssues,
  planToForm,
  SESSIONS,
  usePlanVersions,
  useSavePlan,
  type PlanField,
  type PlanForm,
  type SessionId,
  type TradingPlan,
} from '../../../../features/plan';

const SESSION_OPTIONS = SESSIONS.map((s) => ({ value: s.id, label: s.city }));
const TIMEFRAME_OPTIONS = (['M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as const).map((t) => ({ value: t, label: t }));

const TEXT_FIELDS: readonly { field: 'entryRules' | 'exitRules' | 'stopRules' | 'targetRules' | 'stopTradingWhen' | 'notes'; hint: string }[] = [
  { field: 'entryRules', hint: 'Example: the setup you wait for, written so someone else could check it' },
  { field: 'exitRules', hint: 'Example: at the target or the stop, and when the setup is no longer valid' },
  { field: 'stopRules', hint: 'Example: beyond the last swing low for a buy' },
  { field: 'targetRules', hint: 'Optional. Example: the next level, at least 1.5 times the risk' },
  { field: 'stopTradingWhen', hint: 'Example: after two losses in a day, or when I feel the urge to win a loss back' },
  { field: 'notes', hint: 'Optional' },
];

const NUMBER_FIELDS: readonly { field: 'riskPerTradePercent' | 'dailyLossPercent' | 'maxTradesPerDay'; hint: string }[] = [
  { field: 'riskPerTradePercent', hint: 'Your own number. The example in the lessons is 1%.' },
  { field: 'dailyLossPercent', hint: 'Your own number. It should be at least one trade’s risk.' },
  { field: 'maxTradesPerDay', hint: `A whole number from ${PLAN_LIMITS.maxTradesPerDay.min} to ${PLAN_LIMITS.maxTradesPerDay.max}` },
];

/** Writes a new version of the plan; earlier versions stay in the history. */
export default function EditPlanScreen() {
  const versions = usePlanVersions();
  if (versions.status === 'loading') return <LoadingState />;
  if (versions.status === 'error') return <ErrorState error={versions.error} onRetry={versions.reload} />;
  return <Editor start={versions.data[0]?.plan ?? EMPTY_PLAN} />;
}

function Editor({ start }: { readonly start: TradingPlan }) {
  const save = useSavePlan();
  const [form, setForm] = useState<PlanForm>(() => planToForm(start));
  const [shown, setShown] = useState<readonly { field: PlanField; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State updates land after a render, so a second quick tap needs this to avoid saving twice.
  const saving = useRef(false);
  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const issueFor = (field: PlanField) => shown.find((i) => i.field === field)?.message ?? null;

  const submit = async () => {
    const plan = formToPlan(form);
    const issues = planIssues(plan);
    setShown(issues);
    if (issues.length > 0 || saving.current) return;
    saving.current = true;
    setBusy(true);
    const r = await save(plan);
    saving.current = false;
    setBusy(false);
    if (r.ok) router.back();
    else setError(errorText(r.error));
  };

  return (
    <Screen testID="plan-edit-screen">
      <Notice title="Your plan, your numbers" tone="info">
        Write rules you can follow on every trade. The example numbers are for learning, not advice. Saving keeps your earlier versions.
      </Notice>
      <Card>
        <TextField
          label={PLAN_FIELD_LABELS.instruments}
          value={form.instruments}
          onChangeText={(t) => set('instruments', t)}
          autoCapitalize="characters"
          hint="Separate with commas. Example: EURUSD, GBPUSD"
          error={issueFor('instruments')}
          testID="plan-field-instruments"
        />
        <ChoiceChips<SessionId> label={PLAN_FIELD_LABELS.sessions} options={SESSION_OPTIONS} selected={[...form.sessions]} onChange={(v) => set('sessions', v)} />
        {issueFor('sessions') ? <AppText color="lossText">{issueFor('sessions')}</AppText> : null}
        <ChoiceChips label={PLAN_FIELD_LABELS.timeframes} options={TIMEFRAME_OPTIONS} selected={[...form.timeframes]} onChange={(v) => set('timeframes', v)} />
        {issueFor('timeframes') ? <AppText color="lossText">{issueFor('timeframes')}</AppText> : null}
      </Card>
      <Card>
        {TEXT_FIELDS.map(({ field, hint }) => (
          <TextField
            key={field}
            label={PLAN_FIELD_LABELS[field]}
            value={form[field]}
            onChangeText={(t) => set(field, t)}
            multiline
            maxLength={PLAN_LIMITS.text}
            hint={hint}
            error={issueFor(field)}
            testID={`plan-field-${field}`}
          />
        ))}
      </Card>
      <Card>
        {NUMBER_FIELDS.map(({ field, hint }) => (
          <TextField
            key={field}
            label={PLAN_FIELD_LABELS[field]}
            value={form[field]}
            onChangeText={(t) => set(field, t)}
            keyboardType="decimal-pad"
            hint={hint}
            error={issueFor(field)}
            testID={`plan-field-${field}`}
          />
        ))}
      </Card>
      {shown.length > 0 ? (
        <AppText accessibilityLiveRegion="polite" color="lossText" testID="plan-issues">
          {`${shown.length} ${shown.length === 1 ? 'thing needs' : 'things need'} fixing before saving.`}
        </AppText>
      ) : null}
      {error ? <AppText color="lossText">{error}</AppText> : null}
      <Button label="Save as a new version" onPress={() => void submit()} busy={busy} disabled={busy} />
    </Screen>
  );
}
