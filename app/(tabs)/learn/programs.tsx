import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { AppText, Button, Card, CardHeader, ErrorState, Notice, Screen, SkeletonState } from '../../../components/ui';
import { CircleCheck, GraduationCap } from '../../../components/ui/icons';
import { useLearningActions, useModuleTitles, usePreferenceMatcher, useProgramList, type ProgramListItem, type ProgramState } from '../../../features/learning';
import { errorText, type AppError } from '../../../shared/errors';
import type { Result } from '../../../shared/result';

const STATE_LABELS: Readonly<Record<ProgramState, string>> = {
  active: 'Under way',
  paused: 'Paused',
  queued: 'In your queue',
  not_added: 'Not added',
  completed: 'Finished',
};

/** Programs (spec §6.1): one is under way at a time; others wait in a queue. */
export default function ProgramsScreen() {
  const list = useProgramList();
  const actions = useLearningActions();
  const { suggestedProgramId } = usePreferenceMatcher();
  const [message, setMessage] = useState<string | null>(null);
  const busy = useRef(false);

  const run = async (work: () => Promise<Result<unknown, AppError>>, done: string) => {
    if (busy.current) return;
    busy.current = true;
    const r = await work();
    busy.current = false;
    setMessage(r.ok ? done : errorText(r.error));
  };

  const add = (item: ProgramListItem) =>
    run(() => actions.addProgram(item.program.id), `${item.program.title} was added. ${list.status === 'success' && list.data.some((i) => i.state === 'active' || i.state === 'paused') ? 'It waits in your queue until you start it.' : 'Your daily classes start today.'}`);

  const start = (item: ProgramListItem) => {
    const enrolment = item.enrolment;
    if (!enrolment) return;
    Alert.alert(
      `Start ${item.program.title} now?`,
      'The program under way goes back to your queue. Its progress is kept, and you can start it again later. Classes for this program are scheduled from today.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Start it', onPress: () => run(() => actions.startQueued(enrolment), `${item.program.title} is now under way. Today’s class is on Home.`) },
      ],
    );
  };

  return (
    <Screen testID="programs-screen">
      <AppText color="textSecondary">One program is under way at a time. Others wait in your queue, in the order you added them. Progress in each program is kept.</AppText>
      {message ? <Notice live title="Programs">{message}</Notice> : null}
      {list.status === 'loading' ? <SkeletonState rows={2} /> : null}
      {list.status === 'error' ? <ErrorState error={list.error} onRetry={list.reload} /> : null}
      {list.status === 'success' ? list.data.map((item) => <ProgramCard key={item.program.id} item={item} suggested={item.program.id === suggestedProgramId} onAdd={() => add(item)} onStart={() => start(item)} />) : null}
    </Screen>
  );
}

interface ProgramCardProps {
  readonly item: ProgramListItem;
  /** Best fit for the learner's saved choices (Settings → What I want to learn). */
  readonly suggested: boolean;
  readonly onAdd: () => void;
  readonly onStart: () => void;
}

function ProgramCard({ item, suggested, onAdd, onStart }: ProgramCardProps) {
  const titleOf = useModuleTitles();
  const { program, state, queuePlace } = item;
  return (
    <Card>
      <CardHeader icon={state === 'completed' ? CircleCheck : GraduationCap} tone={state === 'active' || state === 'paused' || state === 'completed' ? 'brand' : 'neutral'} title={program.title} />
      <AppText variant="caption" color="textSecondary" testID={`program-state-${program.id}`}>
        {queuePlace ? `${STATE_LABELS[state]} (number ${queuePlace})` : STATE_LABELS[state]}
      </AppText>
      {suggested ? (
        <AppText variant="caption" color="brand" testID={`program-suggested-${program.id}`}>
          Suggested for you, from your saved choices
        </AppText>
      ) : null}
      <AppText>{program.summary}</AppText>
      <AppText variant="caption" color="textSecondary">{`${program.moduleIds.length} modules · suggested length ${program.defaultWeeks} weeks: ${program.moduleIds.map(titleOf).join(' · ')}`}</AppText>
      {state === 'not_added' || state === 'completed' ? (
        <Button label={state === 'completed' ? 'Take it again' : 'Add this program'} variant="secondary" onPress={onAdd} />
      ) : null}
      {state === 'queued' ? <Button label="Start it now" variant="secondary" onPress={onStart} /> : null}
      {state === 'active' || state === 'paused' ? <Button label="Go to today’s class on Home" variant="secondary" onPress={() => router.push('/')} /> : null}
    </Card>
  );
}
