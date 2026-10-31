import { View } from 'react-native';
import { moneyMagnitude, moneyText, riskAtStopsText, spokenMoney, type PaperSession } from '../../features/paper';
import { MoneyText } from '../ui/MoneyText';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { PnLValue } from '../ui/PnLValue';
import { CardHeader } from '../ui/CardHeader';
import { ChartColumn } from '../ui/icons';
import { StatTile } from '../ui/StatTile';
import { directionOf, spokenAmount } from '../ui/valueParts';

const pct = (d: { times(n: number): { toFixed(n: number): string } }) => `${d.times(100).toFixed(1)}%`;

/** Balance · Margin in use · Risk at stops, then results and the account's other figures, all in one Paper card. */
export function PaperAccountStats({ session }: { readonly session: PaperSession }) {
  const { spacing } = useTheme();
  const { view } = session;
  const risk = riskAtStopsText(view);
  return (
    <Card testID="paper-stats">
      <CardHeader icon={ChartColumn} title="Account" badge="paper" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <StatTile caption="Balance" value={moneyText(view.balance)} money testID="paper-balance" accessibilityLabel={`Balance, paper account, ${spokenMoney(view.balance)}`} />
        <StatTile caption="Margin in use" value={moneyText(view.marginUsed)} money accessibilityLabel={`Margin in use, paper account, ${spokenMoney(view.marginUsed)}`} />
        <StatTile
          caption="Risk at stops"
          value={risk}
          money={risk !== 'Not defined'}
          accessibilityLabel={risk === 'Not defined' ? 'Risk at stops, not defined: a position has no stop' : `Risk at stops, paper account, ${spokenAmount(risk)}`}
        />
      </View>
      <ResultLine label="Realised" value={view.realised} />
      <ResultLine label="Open" value={view.unrealised} />
      <FigureLine label="Costs paid" amount={view.costsPaid} />
      <FigureLine label="Free margin" amount={view.freeMargin} />
      <FigureLine label="Exposure" amount={view.exposure} />
      <AppText color="textSecondary" tabular>{`${view.marginLevel ? `Margin level ${pct(view.marginLevel)} · ` : ''}Drawdown now ${pct(view.drawdown)} · Largest ${pct(view.maxDrawdown)}`}</AppText>
      {view.events.length > 0 ? (
        <AppText color="textSecondary" testID="paper-events" accessibilityLiveRegion="polite">
          {view.events.join('. ')}
        </AppText>
      ) : null}
    </Card>
  );
}

function ResultLine({ label, value }: { readonly label: string; readonly value: PaperSession['view']['realised'] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <AppText color="textSecondary" accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </AppText>
      <PnLValue direction={directionOf(value.toNumber(), 2)} amount={moneyMagnitude(value)} subject={`${label} result, paper`} />
    </View>
  );
}

/** A labelled money line: label left, the amount right, read as "Free margin, paper, 9,990.00 USD". */
function FigureLine({ label, amount }: { readonly label: string; readonly amount: PaperSession['view']['realised'] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <AppText color="textSecondary" accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </AppText>
      <MoneyText color="textSecondary" accessibilityLabel={`${label}, paper, ${spokenMoney(amount)}`}>
        {moneyText(amount)}
      </MoneyText>
    </View>
  );
}
