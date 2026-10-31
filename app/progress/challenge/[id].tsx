import { useLocalSearchParams } from 'expo-router';
import { AppText, Card, EmptyState, ErrorState, LoadingState, Notice, Screen } from '../../../components/ui';
import { awardDate, CHALLENGE_DIMENSION_LABELS, READINESS_DISCLAIMER, SKILL_LABELS, useProgressDashboard } from '../../../features/progress';

/** One challenge (spec §27): each requirement, what it assesses, and progress from your own records. */
export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const state = useProgressDashboard();
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  const p = state.data.challenges.find((c) => c.challenge.id === id);
  if (!p) return <EmptyState title="Challenge not found" body="This challenge is not available." />;
  return (
    <Screen testID="challenge-screen">
      <AppText variant="title">{p.challenge.title}</AppText>
      <AppText>{p.challenge.summary}</AppText>
      <AppText color="textSecondary">{`Skills: ${p.challenge.skills.map((s) => SKILL_LABELS[s]).join(', ')}`}</AppText>
      {p.completed ? (
        <Notice title={p.completedAt ? `Completed on ${awardDate(state.data, p.completedAt)}` : 'Challenge completed'} tone="success">
          {`Every requirement was met, and it stays completed. It shows understanding and process. ${READINESS_DISCLAIMER}`}
        </Notice>
      ) : null}
      {p.criteria.map((c, i) => (
        <Card key={`${c.criterion.kind}-${i}`}>
          <AppText variant="label">{`${c.met ? '✓' : '○'} ${CHALLENGE_DIMENSION_LABELS[c.criterion.dimension]}`}</AppText>
          <AppText testID={`criterion-${i}`}>{c.criterion.label}</AppText>
          <AppText color="textSecondary">{c.detail}</AppText>
        </Card>
      ))}
    </Screen>
  );
}
