import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { GlossaryText } from '../../../components/lesson/GlossaryText';
import { AppText, Card, EmptyState, Screen } from '../../../components/ui';
import { statementRows, useLabContent } from '../../../features/labs';
import { useTheme } from '../../../theme';

/** One fictional company's statements, year by year, with its qualitative notes. */
export default function CompanyScreen() {
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useLabContent().company(id ?? '');
  if (!company) {
    return (
      <Screen>
        <EmptyState title="Company not found" body="It may have been removed in a content update." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  const labels = company.years.map((y) => y.label);
  return (
    <Screen testID="company-screen">
      <Stack.Screen options={{ title: 'Company' }} />
      <AppText variant="title">{company.name}</AppText>
      <AppText variant="caption" color="textSecondary">{`${company.sector} · figures in millions of US dollars, except per share`}</AppText>
      <GlossaryText>{company.summary}</GlossaryText>
      <Card>
        <AppText variant="heading">Assumptions</AppText>
        <GlossaryText>{company.assumptions}</GlossaryText>
      </Card>
      {statementRows(company).map((r) => (
        <Card key={r.label}>
          <AppText variant="label">{r.label}</AppText>
          <AppText variant="caption" color="textSecondary">{r.help}</AppText>
          <View style={{ gap: spacing.xs }}>
            {r.values.map((v, i) => (
              <AppText key={labels[i] ?? i}>{`${labels[i] ?? ''}: ${v}`}</AppText>
            ))}
          </View>
        </Card>
      ))}
      <Card>
        <AppText variant="heading">Business quality and risks</AppText>
        {company.notes.map((n) => (
          <GlossaryText key={n}>{`• ${n}`}</GlossaryText>
        ))}
      </Card>
    </Screen>
  );
}
