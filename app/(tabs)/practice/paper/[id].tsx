import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { PriceChart } from '../../../../components/chart/PriceChart';
import { PaperAccountHero } from '../../../../components/paper/PaperAccountHero';
import { PaperAccountStats } from '../../../../components/paper/PaperAccountStats';
import { PaperHistory } from '../../../../components/paper/PaperHistory';
import { PaperPositions } from '../../../../components/paper/PaperPositions';
import { PaperTicket } from '../../../../components/paper/PaperTicket';
import { AppText, Button, Card, ErrorState, LoadingState, Notice, Screen } from '../../../../components/ui';
import { PAPER_LABEL, usePaperSession, type PaperSession } from '../../../../features/paper';
import { simulatedTime, toChartCandles, type LevelLine } from '../../../../features/practice';
import { useSettings } from '../../../../features/settings';
import { useTheme } from '../../../../theme';

export default function PaperAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = usePaperSession(id ?? '');
  if (session.status === 'loading') return <LoadingState />;
  if (session.status === 'error') {
    return (
      <Screen>
        <ErrorState error={session.error} />
        <Button label="Back to accounts" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  return <Account session={session} />;
}

function Account({ session }: { readonly session: PaperSession }) {
  const { spacing } = useTheme();
  const { view, instrument } = session;
  const [showNotes, setShowNotes] = useState(false);
  // Reset and delete live behind the hero's options button, not on the main path (restyle brief §5.3).
  const [menuOpen, setMenuOpen] = useState(false);
  const settings = useSettings();
  // Until settings load the checklist is shown: asking once too often is the safer mistake.
  const checklist = settings.status === 'success' ? settings.data.preTradeChecklist : true;
  const candles = useMemo(() => toChartCandles(view.candles), [view.candles]);
  const levels = useMemo<LevelLine[]>(
    () =>
      view.positions.flatMap((p) => [
        { price: Number(p.entry), label: `Entry ${p.id}`, tone: 'primary' as const },
        ...(p.stopLoss ? [{ price: Number(p.stopLoss), label: `Stop ${p.id}`, tone: 'negative' as const }] : []),
        ...(p.takeProfit ? [{ price: Number(p.takeProfit), label: `Target ${p.id}`, tone: 'positive' as const }] : []),
      ]),
    [view.positions],
  );
  const last = view.candles[view.candles.length - 1];
  const reset = () =>
    Alert.alert('Reset this account?', 'The balance goes back to the start on a new simulated chart. Journal entries stay.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => void session.reset() },
    ]);
  const remove = () =>
    Alert.alert('Delete this account?', 'The account and its open positions are removed. Its trades stay in your journal.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void session.remove().then((done) => {
            if (done) router.back();
          }),
      },
    ]);

  return (
    <Screen testID="paper-account-screen">
      <Notice title={PAPER_LABEL} tone="info">
        {`${instrument.symbol}: simulated prices and example market terms, not a real broker's. Nothing here is a real trade.`}
      </Notice>
      {session.cooldown ? (
        <Notice live title="Time for a pause" tone="warning">
          {session.cooldown.message}
        </Notice>
      ) : null}
      <PaperAccountHero session={session} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
      {menuOpen ? (
        <Card testID="paper-account-actions">
          <AppText variant="heading">Account options</AppText>
          <AppText color="textSecondary">Both ask you to confirm first. Your trades stay in the journal either way.</AppText>
          <Button label="Reset account" variant="secondary" onPress={reset} disabled={session.busy} />
          <Button label="Delete account" variant="danger" onPress={remove} disabled={session.busy} />
        </Card>
      ) : null}
      <PaperAccountStats session={session} />
      <PriceChart candles={candles} levels={levels} followLatest testID="paper-chart" />
      <AppText testID="paper-time" tabular>{`Now: ${last ? simulatedTime(last.time) : ''} · ${view.remaining} candles left`}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button label="Next candle" onPress={() => void session.next(1)} disabled={session.busy || view.finished} />
        <Button label="Skip 10 candles" variant="secondary" onPress={() => void session.next(10)} disabled={session.busy || view.finished} accessibilityHint="Stops early if a trade opens or closes" />
      </View>
      {session.error ? (
        <AppText color="lossText" accessibilityLiveRegion="polite" testID="paper-error">
          {session.error}
        </AppText>
      ) : null}
      {view.finished ? (
        <Notice title="This session has ended" tone="info">
          Reset the account to keep practising on a new simulated chart. Your trades are in the journal.
        </Notice>
      ) : (
        <PaperTicket session={session} checklist={checklist} />
      )}
      <PaperPositions session={session} />
      <PaperHistory session={session} />
      <Card>
        <Button label={showNotes ? 'Hide how this market works' : 'How this market works'} variant="secondary" expanded={showNotes} onPress={() => setShowNotes((v) => !v)} />
        {showNotes ? instrument.notes.map((n) => <AppText key={n}>{`• ${n}`}</AppText>) : null}
      </Card>
    </Screen>
  );
}
