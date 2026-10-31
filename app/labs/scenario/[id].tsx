import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { PickExercise, type VerdictLabels } from '../../../components/labs/PickExercise';
import { GlossaryText } from '../../../components/lesson/GlossaryText';
import { AppText, Card, EmptyState, Screen } from '../../../components/ui';
import { CardHeader } from '../../../components/ui/CardHeader';
import { Lightbulb } from '../../../components/ui/icons';
import { scenarioOptions, useLabContent, useLabExercise, type MarketScenario } from '../../../features/labs';
import { orderedOptions } from '../../../features/learning';

const LABELS: VerdictLabels = {
  found: 'Plausible, and you chose it',
  missed: 'Also plausible',
  wrongly_picked: 'Not a plausible reading here',
  rightly_left: 'Rightly left out',
};

export default function ScenarioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const found = useLabContent().scenario(id ?? '');
  if (!found) {
    return (
      <Screen>
        <EmptyState title="Scenario not found" body="It may have been removed in a content update." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <ScenarioView item={found} />;
}

function ScenarioView({ item }: { readonly item: MarketScenario }) {
  const options = useMemo(() => scenarioOptions(item), [item]);
  const shown = useMemo(() => orderedOptions({ id: item.id, options: item.reactions }), [item]);
  const exercise = useLabExercise('scenario', item.id, options);
  const r = item.release;
  return (
    <Screen testID="scenario-screen">
      <Stack.Screen options={{ title: 'What could happen?' }} />
      <AppText variant="title">{item.title}</AppText>
      <AppText variant="caption" color="textSecondary">A fictional scenario for practice, not a forecast.</AppText>
      <GlossaryText>{item.setup}</GlossaryText>
      {r ? (
        <Card>
          <AppText variant="heading" testID="scenario-release">{r.name}</AppText>
          <AppText>{`Expected (consensus): ${r.consensus} ${r.unit}`}</AppText>
          <AppText>{`Actual: ${r.actual} ${r.unit}`}</AppText>
          {r.previous !== null ? <AppText>{`Previous: ${r.previous} ${r.unit}`}</AppText> : null}
        </Card>
      ) : null}
      <Card>
        <AppText variant="heading">What was priced in</AppText>
        <GlossaryText>{item.pricedIn}</GlossaryText>
      </Card>
      <PickExercise question={item.question} options={shown} exercise={exercise} labels={LABELS} checkLabel="Check my answer" />
      {exercise.mark ? (
        <Card>
          <CardHeader icon={Lightbulb} title="Takeaway" />
          <GlossaryText>{item.takeaway}</GlossaryText>
        </Card>
      ) : null}
    </Screen>
  );
}
