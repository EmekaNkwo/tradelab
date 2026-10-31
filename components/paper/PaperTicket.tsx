import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { checklistPrefill, moneyText, spokenMoney, type OrderCheck, type PaperSession, type TicketForm } from '../../features/paper';
import { evaluateChecklist, type ChecklistAnswer, type ChecklistAnswers, type ChecklistItemId } from '../../features/plan';
import { PreTradeChecklist } from '../plan/PreTradeChecklist';
import { useTheme } from '../../theme';
import { AppText, Button, Card, MoneyText, Notice, SegmentedControl, TextField } from '../ui';
import { Plus } from '../ui/icons';
import { CardHeader } from '../ui/CardHeader';
import { canOpen } from '../../shared/routeAccess';

const SIDES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const;

const TYPES = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
  { value: 'stop', label: 'Stop' },
] as const;

const EMPTY: TicketForm = { side: 'buy', type: 'market', size: '', price: '', stopLoss: '', takeProfit: '' };

/**
 * Paper order ticket (spec §17, §19). The order is checked against the
 * learner's risk rules first; any rule it breaks is shown with the numbers
 * and a lesson, and placing it anyway records the break in the journal.
 * With the checklist setting on, the pre-trade checklist follows the check.
 */
export function PaperTicket({ session, checklist }: { readonly session: PaperSession; readonly checklist: boolean }) {
  const { spacing } = useTheme();
  const [form, setForm] = useState<TicketForm>(EMPTY);
  const [checked, setCheck] = useState<{ readonly at: string; readonly value: OrderCheck; readonly answers: ChecklistAnswers } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { instrument, view } = session;
  const set = (key: keyof TicketForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setCheck(null);
  };
  // A check is only valid for the order and the account state it was made on: editing the form clears it, and a new
  // candle, a close, a cancel, a stop edit or a reset hides it (each changes this key).
  const stateKey = [session.account.resets, view.candles.length, view.history.length, view.positions.map((p) => `${p.id}:${p.size.toString()}:${p.stopLoss?.toString() ?? '-'}`).join(','), view.orders.length].join('|');
  const check = checked && checked.at === stateKey ? checked.value : null;
  const sides = instrument.allowShort ? SIDES : SIDES.filter((s) => s.value === 'buy');

  const review = () => {
    const r = session.check(form);
    setError(r.ok ? null : r.error.message);
    setCheck(r.ok ? { at: stateKey, value: r.value, answers: checklistPrefill(r.value) } : null);
  };
  const answer = (id: ChecklistItemId, a: ChecklistAnswer) => setCheck((c) => (c ? { ...c, answers: { ...c.answers, [id]: a } } : c));
  const answers = check && checked ? checked.answers : {};
  const checklistDone = !checklist || evaluateChecklist(answers).complete;
  const place = async () => {
    if (!check || !checklistDone) return;
    if (await session.place(check)) {
      setForm(EMPTY);
      setCheck(null);
    }
  };

  return (
    <Card testID="paper-ticket">
      <CardHeader icon={Plus} title="New order" badge="paper" />
      <AppText color="textSecondary" tabular>
        {'Bid '}
        <AppText color="textSecondary" testID="paper-bid">
          {view.bid.toString()}
        </AppText>
        {' · Ask '}
        <AppText color="textSecondary" testID="paper-ask">
          {view.ask.toString()}
        </AppText>
        {". Market orders fill at the next candle's open, plus slippage."}
      </AppText>
      <SegmentedControl label="Side" options={sides} value={form.side} onChange={set('side')} />
      <SegmentedControl label="Order type" options={TYPES} value={form.type} onChange={set('type')} />
      <View style={{ gap: spacing.sm }}>
        <TextField
          label={`Size (${instrument.sizeUnit})`}
          value={form.size}
          onChangeText={set('size')}
          keyboardType="decimal-pad"
          testID="paper-size"
          hint={`Smallest ${instrument.minSize.toString()}, in steps of ${instrument.sizeStep.toString()}`}
        />
        {form.type !== 'market' ? <TextField label="Order price" value={form.price} onChangeText={set('price')} keyboardType="decimal-pad" testID="paper-price" /> : null}
        <TextField label="Stop loss" value={form.stopLoss} onChangeText={set('stopLoss')} keyboardType="decimal-pad" testID="paper-stop" hint="Where your idea is proven wrong" />
        <TextField label="Take profit (optional)" value={form.takeProfit} onChangeText={set('takeProfit')} keyboardType="decimal-pad" testID="paper-target" />
      </View>
      {error ? (
        <AppText color="lossText" accessibilityLiveRegion="polite" testID="paper-ticket-error">
          {error}
        </AppText>
      ) : null}
      {check ? <CheckResult check={check} /> : null}
      {check && checklist ? <PreTradeChecklist answers={answers} onAnswer={answer} fixed={['stop_set', 'risk_within']} /> : null}
      {check ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={check.violations.length > 0 ? 'Place anyway (recorded as a rule break)' : `Place ${form.side} ${form.type} order`}
            variant={check.violations.length > 0 ? 'danger' : 'primary'}
            onPress={place}
            busy={session.busy}
            disabled={!checklistDone}
            disabledReason="Answer every question in the checklist first."
          />
          <Button label="Change the order" variant="secondary" onPress={() => setCheck(null)} />
        </View>
      ) : (
        <Button label="Check against my risk rules" onPress={review} />
      )}
    </Card>
  );
}

function CheckResult({ check }: { readonly check: OrderCheck }) {
  return (
    <View testID="paper-check">
      {check.plannedRisk ? (
        <AppText>
          {'Planned loss at the stop: '}
          <MoneyText testID="paper-check-risk" accessibilityLabel={`paper, ${spokenMoney(check.plannedRisk)}`}>
            {moneyText(check.plannedRisk)}
          </MoneyText>
          {' (costs included; a gap can make it larger).'}
        </AppText>
      ) : (
        <AppText>No stop: the possible loss is not defined.</AppText>
      )}
      <AppText>
        {'Margin or cash needed: '}
        <MoneyText testID="paper-check-margin" accessibilityLabel={`paper, ${spokenMoney(check.marginNeeded)}`}>
          {moneyText(check.marginNeeded)}
        </MoneyText>
        {'.'}
      </AppText>
      {check.violations.length === 0 ? (
        <Notice live title="Within your rules" tone="success">
          This order is inside every risk rule you set.
        </Notice>
      ) : (
        check.violations.map((v) => (
          <Notice key={v.rule} title={`Breaks a rule: ${v.ruleText}`} tone="warning">
            <AppText>{v.calculation}</AppText>
            {v.lessonId ? <LessonLink id={v.lessonId} /> : null}
          </Notice>
        ))
      )}
    </View>
  );
}

/** A full-width, labelled link so it is easy to hit and clear to screen readers (the inline version was neither). */
function LessonLink({ id }: { readonly id: string }) {
  if (!canOpen('/lesson/[id]')) return null;
  return <Button label="Revisit the lesson on this rule" variant="secondary" onPress={() => router.push({ pathname: '/lesson/[id]', params: { id } })} />;
}
