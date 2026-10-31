import { router, Stack, useLocalSearchParams } from 'expo-router';
import { GlossaryText } from '../../../components/lesson/GlossaryText';
import { AppText, Button, Card, EmptyState, ListRow, RecordsNotice, Screen } from '../../../components/ui';
import { CardHeader } from '../../../components/ui/CardHeader';
import { ChartCandlestick, TriangleAlert } from '../../../components/ui/icons';
import { conceptPerformance, LEVEL_LABELS, useLabContent, useLabRecords, type LabRecord } from '../../../features/labs';
import { DRILL_INFO, DRILL_KINDS, presetToParams, useDrillStats } from '../../../features/practice';
import { canOpen } from '../../../shared/routeAccess';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One lab concept (spec §11, §12): explanation, examples, when it misleads, chart, practice and record. */
export default function LabConceptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const content = useLabContent();
  const concept = content.concept(id ?? '');
  const drills = useDrillStats();
  const records = useLabRecords();
  if (!concept) {
    return (
      <Screen>
        <EmptyState title="Concept not found" body="It may have been removed in a content update." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  const performance = conceptPerformance(
    concept,
    drills.status === 'success' ? drills.data : [],
    records.status === 'success' ? records.data : new Map<string, LabRecord>(),
  );
  const drillKind = DRILL_KINDS.find((k) => k === concept.drillKind) ?? null;
  const exerciseTitle = (exerciseId: string) => content.redFlagCase(exerciseId)?.title ?? content.scenario(exerciseId)?.title ?? exerciseId;
  const openExercise = (exerciseId: string) =>
    content.redFlagCase(exerciseId)
      ? router.push({ pathname: '/labs/red-flag/[id]', params: { id: exerciseId } })
      : router.push({ pathname: '/labs/scenario/[id]', params: { id: exerciseId } });

  return (
    <Screen testID="lab-concept-screen">
      <RecordsNotice queries={[records, drills]} />
      <Stack.Screen options={{ title: concept.lab === 'technical' ? 'Technical concept' : 'Fundamental concept' }} />
      <AppText variant="title">{concept.title}</AppText>
      <AppText variant="caption" color="textSecondary">{LEVEL_LABELS[concept.level]}</AppText>
      <GlossaryText>{concept.summary}</GlossaryText>
      <Card>
        <AppText variant="heading">A good example</AppText>
        <GlossaryText>{concept.goodExample}</GlossaryText>
        <AppText variant="heading">A bad example</AppText>
        <GlossaryText>{concept.badExample}</GlossaryText>
      </Card>
      <Card>
        <CardHeader icon={TriangleAlert} tone="warning" title="When it misleads" />
        <GlossaryText>{concept.unreliableWhen}</GlossaryText>
      </Card>
      {concept.chart ? (
        <Card>
          <CardHeader icon={ChartCandlestick} tone="simulated" title="Study it on a chart" />
          <GlossaryText>{concept.chart.lookFor}</GlossaryText>
          {canOpen('/practice/chart-lab') ? (
            <Button
              label="Open in Chart Lab"
              variant="secondary"
              onPress={() => concept.chart && router.push({ pathname: '/practice/chart-lab', params: presetToParams(concept.chart) })}
            />
          ) : null}
          <AppText variant="caption" color="textSecondary">Charts are simulated. Each one is different, so the pattern may be clear, faint or missing.</AppText>
        </Card>
      ) : null}
      {concept.drillKind || performance.exercises.length > 0 || concept.companyIds.length > 0 ? (
        <Card>
          <AppText variant="heading">Practise it</AppText>
          {drillKind && performance.drill && canOpen('/practice/drill') ? (
            <ListRow
              testID="concept-drill"
              title={`Drill: ${DRILL_INFO[drillKind].title}`}
              subtitle={performance.drill.attempts === 0 ? 'Not tried yet' : `Your record: ${performance.drill.correct} of ${performance.drill.attempts} right`}
              onPress={() => router.push({ pathname: '/practice/drill', params: { kind: drillKind } })}
            />
          ) : null}
          {performance.exercises.map((e) => (
            <ListRow
              key={e.id}
              testID={`concept-exercise-${e.id}`}
              title={exerciseTitle(e.id)}
              subtitle={e.record ? `Your record: best ${pct(e.record.best)}, latest ${pct(e.record.latest)} (${e.record.attempts} tries)` : 'Not tried yet'}
              onPress={() => openExercise(e.id)}
            />
          ))}
          {concept.companyIds.length > 0 ? (
            <ListRow
              testID="concept-companies"
              title="Compare the fictional companies"
              subtitle={concept.companyIds.map((c) => content.company(c)?.name ?? c).join(', ')}
              onPress={() => router.push({ pathname: '/labs/companies', params: { ids: concept.companyIds.join(',') } })}
            />
          ) : null}
        </Card>
      ) : null}
      {concept.lessonIds.length > 0 && canOpen('/lesson/[id]') ? (
        <Card>
          <AppText variant="heading">Lessons</AppText>
          {concept.lessonIds.map((l) => (
            <ListRow key={l} testID={`concept-lesson-${l}`} title={content.lessonTitle(l) ?? l} onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: l } })} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
