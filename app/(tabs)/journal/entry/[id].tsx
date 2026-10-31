import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { EmotionPicker } from '../../../../components/journal/EmotionPicker';
import { JournalResult, ProcessChipView } from '../../../../components/journal/JournalBits';
import { AppText, Button, Card, CardHeader, ErrorState, Icon, IconWell, InstrumentIcon, ChoiceChips, Notice, Screen, SkeletonState, TextField } from '../../../../components/ui';
import { ChartCandlestick, CircleCheck, Minus, NotebookPen, Sparkles, Target, TriangleAlert, X } from '../../../../components/ui/icons';
import { badgeKindOf, JOURNAL_SOURCE_LABELS, MAX_JOURNAL_TEXT, processChip, reviewToForm, ruleShortName, tradeTime, useJournalEntry, type JournalEntryScreen, type ProcessCheck, type ReviewForm } from '../../../../features/journal';
import { baseSymbol } from '../../../../features/paper';
import { useTheme } from '../../../../theme';
import { errorText } from '../../../../shared/errors';

export default function JournalEntryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useJournalEntry(id ?? '');
  if (state.status === 'loading') return <SkeletonState rows={3} />;
  if (state.status === 'error') {
    return (
      <Screen>
        <ErrorState error={state.error} />
        <Button label="Back to the journal" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  return <Entry screen={state.data} />;
}

const FOLLOWED = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

function Entry({ screen }: { readonly screen: JournalEntryScreen }) {
  const { spacing } = useTheme();
  const { entry, process } = screen;
  const [form, setForm] = useState<ReviewForm>(() => reviewToForm(entry));
  const [message, setMessage] = useState<string | null>(null);
  const [noteAfter, setNoteAfter] = useState(entry.noteAfter ?? '');
  const [entryReason, setEntryReason] = useState(entry.entryRationale ?? '');
  const set = (key: keyof ReviewForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const report = (r: { ok: boolean; error?: { message: string } }, done: string) => setMessage(r.ok ? done : (r.error?.message ?? 'Something went wrong'));

  const remove = () =>
    Alert.alert('Delete this entry?', 'It is removed from the journal and your summaries. This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const r = await screen.remove();
          if (r.ok) router.back();
          else setMessage(errorText(r.error));
        },
      },
    ]);

  const facts = [
    ['Source', JOURNAL_SOURCE_LABELS[entry.source]],
    ['Direction', entry.direction === 'buy' ? 'Long (buy)' : 'Short (sell)'],
    ['Size', `${entry.size} ${entry.sizeUnit}`],
    ['Entry', entry.entry],
    ['Stop at entry', entry.stop ?? 'none'],
    ['Target', entry.target ?? 'none'],
    ['Exit', entry.exit ?? 'not recorded'],
    ['Planned risk', entry.plannedRisk ?? 'not recorded'],
    ['Costs', entry.costs ?? 'not recorded'],
    ['Opened', tradeTime(entry.source, entry.openedAt)],
    ['Closed', tradeTime(entry.source, entry.closedAt)],
    ['Exit reason', entry.exitRationale ?? '—'],
  ] as const;

  const badge = badgeKindOf(entry.source);
  const chip = processChip(entry);
  return (
    <Screen testID="journal-entry-screen">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <InstrumentIcon symbol={baseSymbol(entry.instrument)} size={44} />
        <AppText variant="title" style={{ flex: 1 }}>{`${entry.direction === 'buy' ? 'Long' : 'Short'} ${entry.instrument}`}</AppText>
      </View>

      <Card testID="journal-result-card">
        <CardHeader icon={Target} title="Result" badge={badge} />
        <JournalResult entry={entry} variant="title" testID="journal-result" />
        {chip ? <ProcessChipView chip={chip} testID="journal-process-chip" /> : null}
        <AppText variant="caption" color="textSecondary">Shown apart from the process: a good result does not make a good decision.</AppText>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconWell icon={CircleCheck} size={40} />
          <AppText variant="heading" testID="journal-process" style={{ flex: 1 }}>{`Process score: ${process.score === null ? 'not yet' : `${Math.round(process.score * 100)}%`}`}</AppText>
        </View>
        <AppText color="textSecondary">This scores how the trade was run, not whether it made money.</AppText>
        {process.checks.map((c) => (
          <CheckLine key={c.id} check={c} />
        ))}
      </Card>

      <Card testID="journal-details">
        <CardHeader icon={ChartCandlestick} title="Trade details" badge={badge} />
        {facts.map(([label, value]) => (
          <AppText key={label} tabular>
            <AppText color="textSecondary">{`${label}: `}</AppText>
            {value}
          </AppText>
        ))}
        {entry.ruleViolations.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <Icon icon={TriangleAlert} size={20} color="warning" />
            <AppText color="warning" style={{ flex: 1 }}>{`Rules broken: ${entry.ruleViolations.map(ruleShortName).join(', ')}`}</AppText>
          </View>
        ) : null}
      </Card>

      <Card>
        <CardHeader icon={NotebookPen} title="Review" />
        <AppText color="textSecondary">Thesis, then plan against what happened, rules, the result, one lesson, and your next goal.</AppText>
        <View style={{ gap: spacing.sm }}>
          <TextField label="1. Thesis: why did you take it?" value={form.thesis} onChangeText={set('thesis')} multiline maxLength={MAX_JOURNAL_TEXT} testID="review-thesis" />
          <TextField label="2. Plan against what happened" value={form.planVsActual} onChangeText={set('planVsActual')} multiline maxLength={MAX_JOURNAL_TEXT} testID="review-plan-vs-actual" />
          <ChoiceChips
            label="3. Did you follow your rules?"
            single
            options={FOLLOWED}
            selected={form.rulesFollowed === null ? [] : [form.rulesFollowed ? 'yes' : 'no']}
            onChange={(v) => v[0] && setForm((f) => ({ ...f, rulesFollowed: v[0] === 'yes' }))}
          />
          <TextField label="4. The result (apart from whether the decision was good)" value={form.resultNote} onChangeText={set('resultNote')} multiline maxLength={MAX_JOURNAL_TEXT} testID="review-result" />
          <TextField label="5. One lesson" value={form.lesson} onChangeText={set('lesson')} multiline maxLength={MAX_JOURNAL_TEXT} testID="review-lesson" />
          <TextField label="6. Next learning goal" value={form.nextGoal} onChangeText={set('nextGoal')} multiline maxLength={MAX_JOURNAL_TEXT} testID="review-next-goal" />
        </View>
        <Button label={entry.review ? 'Update review' : 'Save review'} onPress={async () => report(await screen.saveReview(form), 'Review saved.')} />
      </Card>

      <Card>
        <CardHeader icon={Sparkles} title="Notes and feelings" />
        <TextField label="Entry reason" value={entryReason} onChangeText={setEntryReason} multiline maxLength={MAX_JOURNAL_TEXT} />
        <TextField label="Note after the trade" value={noteAfter} onChangeText={setNoteAfter} multiline maxLength={MAX_JOURNAL_TEXT} />
        <EmotionPicker value={entry.emotion} onChange={async (emotion) => report(await screen.saveNotes({ emotion }), 'Ratings saved.')} />
        <Button
          label="Save notes"
          variant="secondary"
          onPress={async () => report(await screen.saveNotes({ noteAfter: noteAfter.trim() || null, entryRationale: entryReason.trim() || null }), 'Notes saved.')}
        />
      </Card>

      <Card>
        <CardHeader icon={ChartCandlestick} tone="neutral" title="Chart screenshot" />
        {entry.screenshotUri ? (
          <Image source={{ uri: entry.screenshotUri }} style={{ width: '100%', height: 200 }} resizeMode="contain" accessibilityLabel="Attached chart screenshot" />
        ) : (
          <AppText color="textSecondary">None attached. Screenshots stay on this phone and are not part of backups.</AppText>
        )}
        <Button label={entry.screenshotUri ? 'Replace screenshot' : 'Attach a screenshot'} variant="secondary" onPress={async () => report(await screen.attachScreenshot(), 'Screenshot saved.')} />
        {entry.screenshotUri ? <Button label="Remove screenshot" variant="secondary" onPress={async () => report(await screen.removeScreenshot(), 'Screenshot removed.')} /> : null}
      </Card>

      {message ? (
        <Notice live title="Journal" tone="info">
          {message}
        </Notice>
      ) : null}
      <Button label="Delete entry" variant="danger" onPress={remove} />
    </Screen>
  );
}

const CHECK_ICONS = { pass: CircleCheck, fail: X, open: Minus } as const;

/** One process check: an icon and the words (the ✓ / ✗ / – text stays, so meaning never rests on the icon or colour). */
function CheckLine({ check: c }: { readonly check: ProcessCheck }) {
  const { spacing } = useTheme();
  const state = c.passed === null ? 'open' : c.passed ? 'pass' : 'fail';
  const color = state === 'pass' ? 'brand' : state === 'fail' ? 'warning' : 'textSecondary';
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Icon icon={CHECK_ICONS[state]} size={18} color={color} />
      <AppText color={state === 'fail' ? 'warning' : 'textPrimary'} style={{ flex: 1 }}>{`${c.passed === null ? '–' : c.passed ? '✓' : '✗'} ${c.label}${c.passed === null ? ' (not judged yet)' : ''}`}</AppText>
    </View>
  );
}
