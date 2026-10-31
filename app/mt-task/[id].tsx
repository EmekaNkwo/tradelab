import { questionView } from '../../features/learning';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform as Device } from 'react-native';
import { stripGlossaryLinks } from '../../components/lesson/DisclosureNotice';
import { GlossaryText } from '../../components/lesson/GlossaryText';
import { QuestionCard } from '../../components/learning/QuestionCard';
import { AppText, Button, Card, CardHeader, ChoiceChips, ErrorState, LoadingState, Notice, Screen, SegmentedControl, TextField } from '../../components/ui';
import { ListChecks, MonitorSmartphone, NotebookPen } from '../../components/ui/icons';
import {
  MAX_TASK_NOTE_LENGTH,
  stepText,
  useMtTask,
  useMtTaskRunner,
  useTaskStepNotification,
  type BlockReason,
  type MtTaskSession,
  type Platform,
} from '../../features/metatrader';

const PLATFORMS: readonly { value: Platform; label: string }[] = [
  { value: 'mt4', label: 'MT4' },
  { value: 'mt5', label: 'MT5' },
];

const NOTICE_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
] as const;

const BLOCKED: Readonly<Record<BlockReason, string>> = {
  demo_not_confirmed: 'Confirm that you are on a demo account first.',
  steps_not_done: 'Tick each step once you have done it in MetaTrader.',
  questions_not_answered: 'Answer the questions about what you saw.',
};

export default function MtTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useMtTask(id ?? '');
  return (
    <>
      <Stack.Screen options={{ title: 'MetaTrader task' }} />
      {session.status === 'loading' ? <LoadingState /> : null}
      {session.status === 'error' ? (
        <Screen>
          <ErrorState error={session.error} onRetry={session.reload} />
        </Screen>
      ) : null}
      {/* Keyed by task so moving to another task starts a fresh run. */}
      {session.status === 'success' ? <TaskRunner key={session.data.task.id} session={session.data} /> : null}
    </>
  );
}

function TaskRunner({ session }: { readonly session: MtTaskSession }) {
  const run = useMtTaskRunner(session);
  const { task } = session;
  // Resume at the first unanswered question.
  const [questionIndex, setQuestionIndex] = useState(() => {
    const next = task.afterQuestions.findIndex((q) => !(q.id in run.draft.answers));
    return next < 0 ? task.afterQuestions.length : next;
  });
  const question = task.afterQuestions[questionIndex];
  const stepNotice = useTaskStepNotification(task, run.draft.stepsDone, run.saved !== null);
  const [noticeFailed, setNoticeFailed] = useState(false);

  if (run.saved) {
    return (
      <Screen testID="mt-task-done">
        <Notice live title="Task recorded" tone="success">
          <AppText>{`"${task.title}" is saved as done, confirmed by you on ${run.draft.platform.toUpperCase()}.`}</AppText>
          {task.requiresDemo ? <AppText>Demo account confirmed by you.</AppText> : null}
        </Notice>
        <Button label="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen testID="mt-task-screen">
      <Card accent="modeMetaTrader">
        <AppText variant="title">{task.title}</AppText>
        <GlossaryText>{task.summary}</GlossaryText>
        {session.completions.length > 0 ? (
          <AppText variant="caption" color="textSecondary">{`Done ${session.completions.length}× before, confirmed by you. Practise again any time.`}</AppText>
        ) : null}
        <SegmentedControl label="Your MetaTrader" options={PLATFORMS} value={run.draft.platform} onChange={run.setPlatform} testIDPrefix="mt-platform" />
      </Card>

      {task.requiresDemo ? (
        <Card>
          <CardHeader icon={ListChecks} title="Before you start" />
          <ChoiceChips
            label="Demo check"
            options={[{ value: 'demo', label: "I'm on a demo account" }]}
            selected={run.draft.demoConfirmed ? ['demo'] : []}
            onChange={(v) => run.confirmDemo(v.includes('demo'))}
          />
          <AppText variant="caption" color="textSecondary">
            {'In MetaTrader a demo account is usually labelled "Demo". If you are not sure, stop and check before placing any order.'}
          </AppText>
        </Card>
      ) : null}

      <Card>
        <CardHeader icon={MonitorSmartphone} title="Steps" />
        <Button label="Do it in MetaTrader" onPress={() => void run.openMetaTrader()} />
        {/* Ongoing notifications are an Android feature. */}
        {Device.OS === 'android' ? (
          <SegmentedControl
            label="Show the current step in a notification while you are in MetaTrader"
            options={NOTICE_OPTIONS}
            testIDPrefix="mt-step-notice"
            value={stepNotice.enabled ? 'on' : 'off'}
            onChange={async (v) => setNoticeFailed((await stepNotice.toggle(v === 'on')) === 'failed')}
          />
        ) : null}
        {stepNotice.denied ? (
          <Notice live testID="mt-step-notice-denied" title="Notifications are off for TradeLab" tone="warning">
            <AppText>Allow notifications for TradeLab in your phone settings to see the step there. The task works the same without it.</AppText>
          </Notice>
        ) : null}
        {noticeFailed ? (
          <Notice live title="That did not work" tone="warning">
            <AppText>The notification setting was not changed. Please try again.</AppText>
          </Notice>
        ) : null}
        {run.launch === 'not_installed' ? (
          <Notice live testID="mt-launch-not-installed" title={`${run.draft.platform.toUpperCase()} is not installed`} tone="warning">
            <AppText>Install it from Google Play, then come back here.</AppText>
            <Button label="Open Google Play" variant="secondary" onPress={() => void run.openStore()} />
          </Notice>
        ) : null}
        {run.launch === 'unsupported' ? (
          <Notice live testID="mt-launch-unsupported" title="Open MetaTrader yourself">
            <AppText>This device cannot open MetaTrader from TradeLab. Open it from your home screen, then come back here.</AppText>
          </Notice>
        ) : null}
        {run.launch === 'failed' ? (
          <Notice live testID="mt-launch-failed" title="Could not open MetaTrader" tone="warning">
            <AppText>Open it from your home screen instead, then come back here.</AppText>
          </Notice>
        ) : null}
        <ChoiceChips
          label="Tick each step when done"
          options={task.steps.map((s, i) => ({
            value: String(i),
            label: `${i + 1}. ${stripGlossaryLinks(stepText(s, run.draft.platform))}`,
          }))}
          selected={[...run.draft.stepsDone].map(String)}
          onChange={(values) => {
            const now = new Set(values.map(Number));
            task.steps.forEach((_s, i) => {
              if (now.has(i) !== run.draft.stepsDone.has(i)) run.toggleStep(i);
            });
          }}
        />
      </Card>

      <Card>
        <CardHeader icon={NotebookPen} title="What did you see?" />
        {question ? (
          <>
            <AppText variant="caption" color="textSecondary">{`Question ${questionIndex + 1} of ${task.afterQuestions.length}`}</AppText>
            <QuestionCard
              key={question.id}
              question={questionView(question)}
              grade={(chosen) => run.answer(question, chosen)}
              onFirstAttempt={() => undefined}
              onMastered={() => setQuestionIndex((i) => i + 1)}
              continueLabel={questionIndex + 1 === task.afterQuestions.length ? 'Finish questions' : 'Next question'}
            />
          </>
        ) : (
          <AppText>All answered.</AppText>
        )}
      </Card>

      <Card>
        <TextField
          label="Notes (optional)"
          value={run.draft.note}
          onChangeText={run.setNote}
          multiline
          maxLength={MAX_TASK_NOTE_LENGTH}
          placeholder="What you noticed, e.g. the spread you saw"
          testID="mt-task-note"
        />
      </Card>

      {run.error ? (
        <Notice live title="Not saved" tone="warning">
          <AppText>Something went wrong saving this task. Please try again.</AppText>
          <Button label="OK" variant="secondary" onPress={run.dismissError} />
        </Notice>
      ) : null}
      {run.blocked ? (
        <AppText color="textSecondary" testID="mt-task-blocked">
          {BLOCKED[run.blocked]}
        </AppText>
      ) : null}
      <Button label="Mark task as done" onPress={() => void run.complete()} disabled={run.blocked !== null || run.busy} />
    </Screen>
  );
}
