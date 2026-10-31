import { router, Stack, useLocalSearchParams } from 'expo-router';
import { GlossaryText } from '../../components/lesson/GlossaryText';
import { View } from 'react-native';
import { AppText, Card, EmptyState, IconWell, ListRow, Notice, Screen } from '../../components/ui';
import { BookOpen } from '../../components/ui/icons';
import { useTheme } from '../../theme';
import { useGlossaryTerm } from '../../features/tools';

export default function GlossaryTermScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const term = useGlossaryTerm(id ?? '');
  const { spacing } = useTheme();
  if (!term) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Glossary' }} />
        <EmptyState title="Term not found" body="This term is not in the glossary yet." />
      </Screen>
    );
  }
  return (
    <Screen testID="glossary-term-screen">
      <Stack.Screen options={{ title: term.term }} />
      <Card testID="glossary-term-card">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconWell icon={BookOpen} size={44} />
          <AppText variant="title" style={{ flex: 1 }}>
            {term.term}
          </AppText>
        </View>
        {term.aliases.length > 0 ? <AppText variant="caption" color="textSecondary">{`Also: ${term.aliases.join(', ')}`}</AppText> : null}
        <GlossaryText variant="reading">{term.definition}</GlossaryText>
        {term.simpleDefinition ? (
          <Notice title="In short">
            <GlossaryText>{term.simpleDefinition}</GlossaryText>
          </Notice>
        ) : null}
        {term.example ? (
          <Card variant="tile">
            <AppText variant="label" color="textSecondary">
              Example
            </AppText>
            <GlossaryText>{term.example}</GlossaryText>
          </Card>
        ) : null}
      </Card>
      {term.related.length > 0 ? (
        <Card>
          <AppText variant="heading">Related terms</AppText>
          {term.related.map((r) => (
            <ListRow key={r.id} icon={BookOpen} iconTone="neutral" title={r.term} onPress={() => router.push({ pathname: '/glossary/[id]', params: { id: r.id } })} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
