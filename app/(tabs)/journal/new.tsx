import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { EmotionPicker } from '../../../components/journal/EmotionPicker';
import { AppText, Button, Card, CardHeader, ChoiceChips, Notice, Screen, SegmentedControl, TextField } from '../../../components/ui';
import { ChartCandlestick, NotebookPen, Sparkles } from '../../../components/ui/icons';
import { emptyManualForm, MAX_JOURNAL_TEXT, useManualEntry, type ManualTradeForm } from '../../../features/journal';
import type { MarketKind } from '../../../shared/types';
import { useTheme } from '../../../theme';
import { errorText } from '../../../shared/errors';

const MARKETS: readonly { value: MarketKind; label: string }[] = [
  { value: 'forex', label: 'Forex' },
  { value: 'stocks', label: 'Stocks' },
  { value: 'penny_stocks', label: 'Penny stocks' },
  { value: 'commodities', label: 'Commodities' },
  { value: 'futures', label: 'Futures' },
];
const SIDES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const;
const RULES = [
  { value: 'no_stop', label: 'No stop loss' },
  { value: 'risk_per_trade', label: 'Risked more than my limit' },
  { value: 'daily_loss', label: 'Past my daily loss limit' },
  { value: 'open_positions', label: 'Too many open positions' },
  { value: 'margin_use', label: 'Too much margin in use' },
  { value: 'size_up_after_loss', label: 'Sized up after a loss' },
  { value: 'stop_moved_away', label: 'Moved my stop to risk more' },
];

/** Fast manual entry of a MetaTrader demo trade (spec §14.4). */
export default function NewDemoTradeScreen() {
  const { spacing } = useTheme();
  const manual = useManualEntry();
  const [form, setForm] = useState<ManualTradeForm>(emptyManualForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A copied screenshot belongs to this draft until it is saved; leaving without saving removes it.
  const draftShot = useRef<string | null>(null);
  const discard = manual.discardScreenshot;
  useEffect(
    () => () => {
      if (draftShot.current) void discard(draftShot.current);
    },
    [discard],
  );
  const set = (key: keyof ManualTradeForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    // Hand the screenshot to the save first, so leaving mid-save cannot delete a file the new entry points to.
    const shot = draftShot.current;
    draftShot.current = null;
    const r = await manual.save(form);
    setSaving(false);
    if (!r.ok) {
      draftShot.current = shot;
      return setError(errorText(r.error));
    }
    router.replace({ pathname: '/journal/entry/[id]', params: { id: r.value.id } });
  };
  const attach = async () => {
    if (saving) return;
    const r = await manual.pickScreenshot();
    if (!r.ok) return setError(errorText(r.error));
    if (!r.value) return;
    if (draftShot.current) void manual.discardScreenshot(draftShot.current);
    draftShot.current = r.value;
    setForm((f) => ({ ...f, screenshotUri: r.value }));
  };

  return (
    <Screen testID="journal-new-screen">
      <Notice title="Demo accounts only" tone="info">
        Record trades from a demo account. TradeLab never connects to a broker and never asks for your login.
      </Notice>
      <Card>
        <CardHeader icon={NotebookPen} title="The trade" badge="demo" />
        <ChoiceChips label="Market" single options={MARKETS} selected={form.market ? [form.market] : []} onChange={(v) => setForm((f) => ({ ...f, market: v[0] ?? null }))} />
        <View style={{ gap: spacing.sm }}>
          <TextField label="Instrument" value={form.instrument} onChangeText={set('instrument')} placeholder="e.g. EURUSD" maxLength={60} testID="manual-instrument" />
          <SegmentedControl label="Direction" options={SIDES} value={form.direction} onChange={(direction) => setForm((f) => ({ ...f, direction }))} />
          <TextField label="Size" value={form.size} onChangeText={set('size')} keyboardType="decimal-pad" testID="manual-size" />
          <TextField label="Size unit" value={form.sizeUnit} onChangeText={set('sizeUnit')} maxLength={20} />
          <TextField label="Entry price" value={form.entry} onChangeText={set('entry')} keyboardType="decimal-pad" testID="manual-entry" />
          <TextField label="Stop loss" value={form.stop} onChangeText={set('stop')} keyboardType="decimal-pad" testID="manual-stop" />
          <TextField label="Take profit" value={form.target} onChangeText={set('target')} keyboardType="decimal-pad" />
          <TextField label="Exit price" value={form.exit} onChangeText={set('exit')} keyboardType="decimal-pad" />
          <TextField label="Result in account money (after costs)" value={form.result} onChangeText={set('result')} keyboardType="numbers-and-punctuation" testID="manual-result" hint="Negative for a loss" />
          <TextField label="Planned risk (money lost at the stop)" value={form.plannedRisk} onChangeText={set('plannedRisk')} keyboardType="decimal-pad" testID="manual-risk" />
          <TextField label="Account equity when you entered" value={form.equity} onChangeText={set('equity')} keyboardType="decimal-pad" testID="manual-equity" />
          <TextField label="Strategy (optional)" value={form.strategy} onChangeText={set('strategy')} maxLength={MAX_JOURNAL_TEXT} />
          <TextField label="Why you entered" value={form.entryRationale} onChangeText={set('entryRationale')} multiline maxLength={MAX_JOURNAL_TEXT} testID="manual-reason" />
          <TextField label="Why you exited" value={form.exitRationale} onChangeText={set('exitRationale')} multiline maxLength={MAX_JOURNAL_TEXT} />
          <TextField label="Market conditions" value={form.conditions} onChangeText={set('conditions')} multiline maxLength={MAX_JOURNAL_TEXT} />
        </View>
        <ChoiceChips label="Rules you broke (if any)" options={RULES} selected={form.ruleViolations} onChange={(v) => setForm((f) => ({ ...f, ruleViolations: v }))} />
      </Card>
      <Card>
        <CardHeader icon={Sparkles} title="How it felt" />
        <EmotionPicker live value={form.emotion} onChange={(emotion) => setForm((f) => ({ ...f, emotion }))} />
        <AppText color="textSecondary">{form.emotion ? 'Your ratings are saved with the trade.' : 'Optional: tap a rating to include how the trade felt.'}</AppText>
      </Card>
      <Card>
        <CardHeader icon={ChartCandlestick} tone="neutral" title="Chart screenshot" />
        {form.screenshotUri ? <Image source={{ uri: form.screenshotUri }} style={{ width: '100%', height: 160 }} resizeMode="contain" accessibilityLabel="Attached chart screenshot" /> : null}
        <Button label={form.screenshotUri ? 'Replace screenshot' : 'Attach a chart screenshot'} variant="secondary" onPress={attach} disabled={saving} />
      </Card>
      {error ? (
        <AppText color="lossText" accessibilityLiveRegion="polite" testID="manual-error">
          {error}
        </AppText>
      ) : null}
      <Button label="Save to journal" onPress={save} busy={saving} />
    </Screen>
  );
}
