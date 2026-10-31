import { router } from 'expo-router';
import { baseSymbol, tradeRow, type PaperSession } from '../../features/paper';
import { canOpen } from '../../shared/routeAccess';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { InstrumentIcon } from '../ui/InstrumentIcon';
import { ListRow } from '../ui/ListRow';
import { PnLValue } from '../ui/PnLValue';
import { CardHeader } from '../ui/CardHeader';
import { Clock } from '../ui/icons';
import { directionOf, spokenChange } from '../ui/valueParts';

/** How many closed trades the account screen lists, newest first (the journal has them all). */
export const HISTORY_LIMIT = 20;

/** Closed trades as rows: side, symbol and size; prices and costs; the result with sign, arrow and R. */
export function PaperHistory({ session }: { readonly session: PaperSession }) {
  const { view, instrument } = session;
  const rows = [...view.history].reverse().slice(0, HISTORY_LIMIT);
  return (
    <Card testID="paper-history">
      <CardHeader icon={Clock} title={`History (${view.history.length})`} badge="paper" />
      {view.history.length === 0 ? <AppText color="textSecondary">No closed trades yet.</AppText> : null}
      {rows.map((t, k) => {
        const row = tradeRow(t, instrument.symbol, instrument.sizeUnit);
        const direction = directionOf(row.net.toNumber(), 2);
        return (
          <ListRow
            key={`${t.positionId}-${t.closedAt}-${k}`}
            testID="paper-history-item"
            leading={<InstrumentIcon symbol={baseSymbol(instrument.symbol)} size={40} />}
            title={row.title}
            subtitle={row.subtitle}
            trailing={<PnLValue direction={direction} amount={row.amount} r={row.r ?? undefined} />}
            trailingLabel={`Paper, ${spokenChange('Result', direction, row.amount, 'result')}${row.r ? `, ${row.r.replace(/R$/, ' R')}` : ''}`}
          />
        );
      })}
      {canOpen('/journal') ? <Button label="Open the journal" variant="secondary" onPress={() => router.push('/journal')} /> : null}
    </Card>
  );
}
