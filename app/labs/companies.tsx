import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppText, Card, ChoiceChips, ListRow, Notice, Screen } from '../../components/ui';
import { comparisonRows, useLabContent } from '../../features/labs';
import { useTheme } from '../../theme';

/** Fictional companies side by side (spec §10.2, §12). */
export default function CompaniesScreen() {
  const { spacing } = useTheme();
  const content = useLabContent();
  const all = content.companies();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const [chosen, setChosen] = useState<readonly string[]>(() => {
    const wanted = (ids ?? '').split(',').filter((id) => all.some((c) => c.id === id));
    return wanted.length > 0 ? wanted : all.map((c) => c.id);
  });
  const companies = useMemo(() => all.filter((c) => chosen.includes(c.id)), [all, chosen]);
  const rows = useMemo(() => comparisonRows(companies), [companies]);

  return (
    <Screen testID="companies-screen">
      <Notice title="Fictional companies" tone="info">
        Every company and figure here is made up for practice. Ratios use the latest year and the price shown. A good business can still be a poor investment at too high a price, and a low price can be cheap for a reason.
      </Notice>
      <ChoiceChips label="Companies to compare" options={all.map((c) => ({ value: c.id, label: c.name }))} selected={chosen} onChange={(v) => setChosen(v)} />
      {companies.length === 0 ? <AppText color="textSecondary">Choose at least one company.</AppText> : null}
      {rows.map((r) => (
        <Card key={r.label}>
          <AppText variant="label">{r.label}</AppText>
          <AppText variant="caption" color="textSecondary">{r.help}</AppText>
          <View style={{ gap: spacing.xs }}>
            {companies.map((c, i) => (
              <AppText key={c.id} testID={`cell-${r.label}-${c.id}`}>{`${c.name}: ${r.values[i] ?? ''}`}</AppText>
            ))}
          </View>
        </Card>
      ))}
      {companies.length > 0 ? (
        <Card>
          <AppText variant="heading">Statements and notes</AppText>
          {companies.map((c) => (
            <ListRow key={c.id} testID={`company-${c.id}`} title={c.name} subtitle={c.sector} onPress={() => router.push({ pathname: '/labs/company/[id]', params: { id: c.id } })} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
