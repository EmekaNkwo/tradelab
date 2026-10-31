import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { PickExercise, type VerdictLabels } from '../../../components/labs/PickExercise';
import { GlossaryText } from '../../../components/lesson/GlossaryText';
import { AppText, Card, EmptyState, Screen } from '../../../components/ui';
import { CardHeader } from '../../../components/ui/CardHeader';
import { TriangleAlert } from '../../../components/ui/icons';
import { orderedOptions } from '../../../features/learning';
import { redFlagOptions, useLabContent, useLabExercise, type RedFlagCase } from '../../../features/labs';

const LABELS: VerdictLabels = {
  found: 'A warning sign, and you spotted it',
  missed: 'A warning sign you missed',
  wrongly_picked: 'Not a warning sign here',
  rightly_left: 'Rightly left: not a warning sign here',
};

export default function RedFlagCaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const found = useLabContent().redFlagCase(id ?? '');
  if (!found) {
    return (
      <Screen>
        <EmptyState title="Case not found" body="It may have been removed in a content update." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <RedFlagCaseView item={found} />;
}

function RedFlagCaseView({ item }: { readonly item: RedFlagCase }) {
  const options = useMemo(() => redFlagOptions(item), [item]);
  const shown = useMemo(() => orderedOptions({ id: item.id, options: item.signs }), [item]);
  const exercise = useLabExercise('red_flag', item.id, options);
  return (
    <Screen testID="red-flag-screen">
      <Stack.Screen options={{ title: 'Red Flag Detector' }} />
      <AppText variant="title">{item.title}</AppText>
      <AppText variant="caption" color="textSecondary">{`${item.company}. A fictional profile for practice.`}</AppText>
      <Card>
        <AppText variant="heading">The profile</AppText>
        {item.facts.map((f) => (
          <GlossaryText key={f.label}>{`${f.label}: ${f.value}`}</GlossaryText>
        ))}
      </Card>
      <PickExercise question={item.question} options={shown} exercise={exercise} labels={LABELS} checkLabel="Check my red flags" />
      {exercise.mark ? (
        <>
          <Card>
            <AppText variant="heading">What to investigate</AppText>
            {item.investigate.map((i) => (
              <GlossaryText key={i}>{`• ${i}`}</GlossaryText>
            ))}
          </Card>
          <Card>
            <CardHeader icon={TriangleAlert} tone="warning" title="The verdict" />
            <GlossaryText>{item.verdict}</GlossaryText>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
