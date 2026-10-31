import { useState } from 'react';
import { View } from 'react-native';
import { emptyOrderForm, type OrderForm } from '../../features/practice';
import { useTheme } from '../../theme';
import { AppText, Button, Card, SegmentedControl, TextField } from '../ui';
import { CardHeader } from '../ui/CardHeader';
import { Plus } from '../ui/icons';
import { SideSelector } from './SideSelector';

interface OrderTicketProps {
  readonly lastPrice: string;
  readonly onPlace: (form: OrderForm) => boolean;
}

const SIDES = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
] as const;

const TYPES = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
  { value: 'stop', label: 'Stop' },
] as const;

/**
 * A simulated order. Market orders fill at the next candle's open. Buy and Sell are tinted segments with words
 * (brief §5.4). The ticket computes no risk figure before the order is placed, so it shows no risk preview.
 */
export function OrderTicket({ lastPrice, onPlace }: OrderTicketProps) {
  const { spacing } = useTheme();
  const [form, setForm] = useState<OrderForm>(emptyOrderForm);
  const set = (key: keyof OrderForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <Card testID="order-ticket">
      <CardHeader icon={Plus} title="Plan a trade" badge="replay" />
      <AppText color="textSecondary">
        {'Last close '}
        <AppText color="textSecondary" testID="last-close">
          {String(lastPrice)}
        </AppText>
        {". A market order fills at the next candle's open."}
      </AppText>
      <SideSelector options={SIDES} value={form.side} onChange={(side) => setForm((f) => ({ ...f, side }))} />
      <SegmentedControl label="Order type" options={TYPES} value={form.type} onChange={(type) => setForm((f) => ({ ...f, type }))} />
      <View style={{ gap: spacing.sm }}>
        <TextField label="Size (lots)" value={form.lots} onChangeText={set('lots')} keyboardType="decimal-pad" testID="order-lots" />
        {form.type !== 'market' ? <TextField label="Order price" value={form.price} onChangeText={set('price')} keyboardType="decimal-pad" testID="order-price" /> : null}
        <TextField label="Stop loss" value={form.stopLoss} onChangeText={set('stopLoss')} keyboardType="decimal-pad" testID="order-stop" hint="Where your idea is proven wrong" />
        <TextField label="Take profit (optional)" value={form.takeProfit} onChangeText={set('takeProfit')} keyboardType="decimal-pad" testID="order-target" />
      </View>
      <Button label={`Place ${form.side} ${form.type} order`} onPress={() => onPlace(form)} />
    </Card>
  );
}
