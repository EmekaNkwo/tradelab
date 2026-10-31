import { useState } from 'react';
import { View } from 'react-native';
import { moneyMagnitude, moneyText, spokenMoney, stopWidened, type PaperSession } from '../../features/paper';
import { dec, isTypedNumber } from '../../shared/decimal';
import { useTheme } from '../../theme';
import { AppText, Button, Card, directionOf, MoneyText, PnLValue, TextField } from '../ui';
import { CardHeader } from '../ui/CardHeader';
import { ChartCandlestick } from '../ui/icons';

type Position = PaperSession['view']['positions'][number];

const opt = (t: string) => {
  const v = t.trim().replace(',', '.');
  return v === '' ? null : isTypedNumber(v) ? dec(v) : undefined;
};

/** Open positions and pending orders, with close, partial close, edit, and cancel. */
export function PaperPositions({ session }: { readonly session: PaperSession }) {
  const { view } = session;
  if (view.positions.length === 0 && view.orders.length === 0) return null;
  return (
    <Card testID="paper-open">
      <CardHeader icon={ChartCandlestick} title="Open positions and orders" badge="paper" />
      {view.positions.map((p) => (
        <PositionRow key={p.id} position={p} session={session} />
      ))}
      {view.orders.map((o) => (
        <View key={o.id} testID="paper-order">
          <AppText>{`Pending ${o.side} ${o.type} ${o.size.toString()} at ${o.price?.toString() ?? 'market'}${o.stopLoss ? ` · stop ${o.stopLoss.toString()}` : ''}`}</AppText>
          <Button label={`Cancel order ${o.id}`} variant="secondary" onPress={() => void session.cancel(o.id)} disabled={session.busy} />
        </View>
      ))}
    </Card>
  );
}

function PositionRow({ position: p, session }: { readonly position: Position; readonly session: PaperSession }) {
  const { spacing } = useTheme();
  const [editing, setEditing] = useState(false);
  const [stop, setStop] = useState(p.stopLoss?.toString() ?? '');
  const [target, setTarget] = useState(p.takeProfit?.toString() ?? '');
  const [part, setPart] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unit = session.instrument.sizeUnit;

  const save = async () => {
    const s = opt(stop);
    const t = opt(target);
    if (s === undefined || t === undefined) return setError('Prices must be numbers');
    if (await session.edit(p.id, s, t)) {
      setEditing(false);
      setError(null);
    }
  };
  const closePart = async () => {
    const size = opt(part);
    if (!size) return setError(`Enter how many ${unit} to close`);
    if (await session.close(p.id, size)) {
      setPart('');
      setError(null);
    }
  };
  const newStop = opt(stop);
  const widens = editing && newStop !== undefined && stopWidened(p.side, p.stopLoss, newStop);

  return (
    <View style={{ gap: spacing.xs }} testID="paper-position">
      <AppText tabular>{`${p.side === 'buy' ? 'Buy' : 'Sell'} ${p.size.toString()} ${unit} at ${p.entry.toString()}`}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
        <AppText>Open result</AppText>
        <PnLValue direction={directionOf(p.profit.toNumber(), 2)} amount={moneyMagnitude(p.profit)} subject="Open result, paper, costs included" variant="body" testID="paper-position-result" />
        <AppText color="textSecondary">(costs included)</AppText>
      </View>
      <AppText color="textSecondary" tabular>
        {`Stop ${p.stopLoss?.toString() ?? 'none'} · Target ${p.takeProfit?.toString() ?? 'none'} · Margin `}
        <MoneyText color="textSecondary" accessibilityLabel={`Margin, paper, ${spokenMoney(p.margin)}`}>
          {moneyText(p.margin)}
        </MoneyText>
      </AppText>
      {editing ? (
        <View style={{ gap: spacing.sm }}>
          <TextField label="Stop loss" value={stop} onChangeText={setStop} keyboardType="decimal-pad" />
          <TextField label="Take profit" value={target} onChangeText={setTarget} keyboardType="decimal-pad" />
          {widens ? (
            <AppText color="warning" accessibilityLiveRegion="polite" testID="paper-stop-widen">
              This stop risks more than before. Saving it is recorded as a rule break (moving a stop away).
            </AppText>
          ) : null}
          <Button label="Save stop and target" onPress={save} busy={session.busy} />
        </View>
      ) : (
        <Button label="Move stop or target" variant="secondary" onPress={() => setEditing(true)} />
      )}
      <TextField label={`Close part (${unit})`} value={part} onChangeText={setPart} keyboardType="decimal-pad" testID="paper-part" />
      <Button label="Close part" variant="secondary" onPress={closePart} disabled={session.busy} />
      <Button label={`Close position ${p.id}`} onPress={() => void session.close(p.id, null)} disabled={session.busy} />
      {error ? <AppText color="lossText">{error}</AppText> : null}
    </View>
  );
}
