import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AppText, Card, EmptyState, ListRow, Screen } from '../../../components/ui';
import { byLevel, useLabConcepts } from '../../../features/labs';

const TITLES = { technical: 'Technical Analysis Lab', fundamental: 'Fundamental Analysis Lab' } as const;

export default function LabConceptsScreen() {
  const { lab: raw } = useLocalSearchParams<{ lab: string }>();
  const lab = raw === 'fundamental' ? 'fundamental' : 'technical';
  const groups = byLevel(useLabConcepts(lab));
  return (
    <Screen testID={`lab-concepts-${lab}`}>
      <Stack.Screen options={{ title: TITLES[lab] }} />
      <AppText color="textSecondary">
        {lab === 'technical'
          ? 'Each concept has an explanation, a chart to study, good and bad examples, when it misleads, and practice that records how you do.'
          : 'Each concept has an explanation, good and bad examples, when it misleads, and exercises with fictional companies or scenarios.'}
      </AppText>
      {groups.length === 0 ? <EmptyState title="No concepts yet" body="This lab has no concepts in the installed content." /> : null}
      {groups.map((g) => (
        <Card key={g.level}>
          <AppText variant="heading">{g.title}</AppText>
          {g.concepts.map((c) => (
            <ListRow key={c.id} testID={`concept-${c.id}`} title={c.title} subtitle={c.summary} onPress={() => router.push({ pathname: '/labs/concept/[id]', params: { id: c.id } })} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
