import { router } from 'expo-router';
import { AppText, Card, ErrorState, ListRow, LoadingState, Notice, Screen } from '../../components/ui';
import { CircleCheck, ListChecks } from '../../components/ui/icons';
import { awardDate, useProgressDashboard } from '../../features/progress';

/** Challenges and assessments (spec §27): scored on understanding and process, never on profit. */
export default function ChallengesScreen() {
  const state = useProgressDashboard();
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  return (
    <Screen testID="challenges-screen">
      <Notice title="How challenges are judged" tone="info">
        On understanding, risk control, consistency, reasoning, correct rule use and awareness of uncertainty. Never on simulated profit.
      </Notice>
      {state.data.challenges.length > 0 ? (
        <Card style={{ gap: 0 }}>
          {state.data.challenges.map((p) => (
            <ListRow
              icon={p.completed ? CircleCheck : ListChecks}
              iconTone={p.completed ? 'brand' : 'neutral'}
              key={p.challenge.id}
              testID={`challenge-${p.challenge.id}`}
              title={p.challenge.title}
              status={p.completed ? 'Completed' : undefined}
              subtitle={`${p.completedAt ? `Completed on ${awardDate(state.data, p.completedAt)}` : `${p.criteria.filter((c) => c.met).length} of ${p.criteria.length} steps done`} · ${p.challenge.summary}`}
              onPress={() => router.push({ pathname: '/progress/challenge/[id]', params: { id: p.challenge.id } })}
            />
          ))}
        </Card>
      ) : null}
      {state.data.challenges.length === 0 ? <AppText>No challenges are available yet.</AppText> : null}
    </Screen>
  );
}
