import { router } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button, Card, CardHeader, IconWell, LoadingState, Notice, PnLValue, Screen } from '../../../components/ui';
import { CircleCheck, Inbox } from '../../../components/ui/icons';
import { directionOf } from '../../../components/ui/valueParts';
import { groupedMoney, useStatementImport } from '../../../features/journal';
import { useTheme } from '../../../theme';

/** Rows listed in the preview; a long statement would otherwise render thousands of lines. */
const IMPORT_PREVIEW_ROWS = 50;

/** MT statement import (spec §14.4): pick, preview with duplicates marked, then import. */
export default function ImportStatementScreen() {
  const { spacing } = useTheme();
  const flow = useStatementImport();
  const s = flow.state;
  return (
    <Screen testID="journal-import-screen">
      <Notice title="Demo statements only" tone="info">
        In MetaTrader, save your demo account history as an HTML statement, then pick that file here. Nothing is uploaded; the file is read on this phone.
      </Notice>
      {s.step === 'idle' || s.step === 'error' ? (
        <Card>
          <CardHeader icon={Inbox} title="Choose a demo statement" />
          {s.step === 'error' ? (
            <AppText color="lossText" accessibilityLiveRegion="polite" testID="import-error">
              {s.message}
            </AppText>
          ) : null}
          <Button label="Choose a statement file" onPress={() => void flow.pick()} />
        </Card>
      ) : null}
      {s.step === 'reading' || s.step === 'saving' ? <LoadingState label={s.step === 'reading' ? 'Reading the statement…' : 'Importing…'} /> : null}
      {s.step === 'preview' ? (
        <Card>
          <CardHeader icon={Inbox} title={`${s.platform} statement: ${s.rows.length} closed trades`} badge="demo" />
          <AppText color="textSecondary">{`${s.fileName}${s.currency ? ` · account currency ${s.currency}` : ''}. Times are the broker's server time.`}</AppText>
          {s.rows.slice(0, IMPORT_PREVIEW_ROWS).map((r) => {
            const net = r.trade.profit.plus(r.trade.commission).plus(r.trade.swap).toFixed(2);
            return (
              <View key={r.trade.externalId} testID="import-row" style={{ gap: spacing.xxs }}>
                <AppText tabular color={r.duplicate ? 'textSecondary' : 'textPrimary'}>
                  {`${r.trade.side === 'buy' ? 'Buy' : 'Sell'} ${r.trade.volume.toString()} ${r.trade.symbol} · ${r.trade.openPrice.toString()} → ${r.trade.closePrice.toString()}${r.duplicate ? ' · already in your journal, will be skipped' : ''}`}
                </AppText>
                <PnLValue direction={directionOf(Number(net), 2)} amount={groupedMoney(net)} subject="Net result" />
              </View>
            );
          })}
          {s.rows.length > IMPORT_PREVIEW_ROWS ? <AppText color="textSecondary">{`…and ${s.rows.length - IMPORT_PREVIEW_ROWS} more, all imported the same way.`}</AppText> : null}
          {s.skipped.length > 0 ? (
            <Notice title={`${s.skipped.length} rows were not trades and will be left out`} tone="info">
              {s.skipped.slice(0, 10).join('\n')}
            </Notice>
          ) : null}
          <Button label={`Import ${s.rows.filter((r) => !r.duplicate).length} trades`} onPress={() => void flow.confirm()} disabled={s.rows.every((r) => r.duplicate)} disabledReason="Every trade in this file is already in your journal." />
          <Button label="Cancel" variant="secondary" onPress={flow.cancel} />
        </Card>
      ) : null}
      {s.step === 'done' ? (
        <Card liveRegion>
          <IconWell icon={CircleCheck} size={40} />
          <AppText variant="heading" testID="import-done">{`Imported ${s.result.added} trades`}</AppText>
          {s.result.duplicates > 0 ? <AppText>{`${s.result.duplicates} were already in your journal and were skipped.`}</AppText> : null}
          <AppText color="textSecondary">Each is marked &ldquo;Imported from MT statement&rdquo;. Open them in the journal to review.</AppText>
          <Button label="Go to the journal" onPress={() => router.back()} />
        </Card>
      ) : null}
    </Screen>
  );
}

