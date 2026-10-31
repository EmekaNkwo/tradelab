import { useState } from 'react';
import { View } from 'react-native';
import { GlossaryText } from '../../components/lesson/GlossaryText';
import { AppText, Card, ChoiceChips, Notice, Screen } from '../../components/ui';
import { useLabContent } from '../../features/labs';
import { MARKET_LABELS, MARKET_KINDS, type MarketKind } from '../../shared/types';
import { useTheme } from '../../theme';

/** The five markets compared (spec §10.6). Every row says what it depends on. */
export default function MarketsScreen() {
  const { spacing } = useTheme();
  const rows = useLabContent().comparison();
  const [markets, setMarkets] = useState<readonly MarketKind[]>(MARKET_KINDS);
  return (
    <Screen testID="markets-screen">
      <Notice title="No universal labels" tone="info">
        These are typical differences, not rules. Hours, costs, leverage and access vary by exchange, broker, country and market conditions. Check the details for the exact product you use.
      </Notice>
      <ChoiceChips label="Markets to show" options={MARKET_KINDS.map((m) => ({ value: m, label: MARKET_LABELS[m] }))} selected={markets} onChange={(v) => setMarkets(v)} />
      {markets.length === 0 ? <AppText color="textSecondary">Choose at least one market.</AppText> : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <AppText variant="heading">{row.dimension}</AppText>
          <View style={{ gap: spacing.xs }}>
            {MARKET_KINDS.filter((m) => markets.includes(m)).map((m) => (
              <View key={m} testID={`comparison-${row.id}-${m}`}>
                <AppText variant="label">{MARKET_LABELS[m]}</AppText>
                <GlossaryText>{row.cells[m]}</GlossaryText>
              </View>
            ))}
          </View>
          <AppText variant="caption" color="textSecondary">{`Depends on: ${row.caveat}`}</AppText>
        </Card>
      ))}
    </Screen>
  );
}
