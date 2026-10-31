import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, CardHeader, ChoiceChips, EmptyState, ErrorState, LoadingState, Notice, Screen, SegmentedControl, TextField } from '../components/ui';
import { ShieldCheck } from '../components/ui/icons';
import { AI_SUGGESTION_LABEL, COACH_TASK_LABELS, MAX_COACH_QUESTION, useCoach, useCoachSources, type CoachReply, type CoachTask } from '../features/coach';
import { errorText } from '../shared/errors';
import { canOpen } from '../shared/routeAccess';

const TASKS = (Object.keys(COACH_TASK_LABELS) as CoachTask[]).map((t) => ({ value: t, label: COACH_TASK_LABELS[t] }));

/**
 * The coach (spec §24). It explains and asks questions; it never decides.
 * Rule breaks, scores, metrics and grades shown with an answer come from the
 * app's own code, listed apart from the coach's words.
 */
export default function CoachScreen() {
  const sources = useCoachSources();
  const coach = useCoach();
  const [task, setTask] = useState<CoachTask>('explain_concept');
  const [term, setTerm] = useState('');
  const [question, setQuestion] = useState('');
  const [entryId, setEntryId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  if (sources.settings.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (sources.settings.status === 'error') return <Screen><ErrorState error={sources.settings.error} onRetry={sources.settings.reload} /></Screen>;
  const mode = sources.settings.data.integrations.coach;
  if (mode === 'off') {
    return (
      <Screen testID="coach-screen">
        {canOpen('/more/services') ? (
          <EmptyState title="The coach is off" body="Turn it on in Data and AI services. The offline coach uses the app’s own lessons and needs no internet." actionLabel="Open Data and AI services" onAction={() => router.push('/more/services')} />
        ) : (
          <EmptyState title="The coach is off" body="The coach can't be turned on in this version of the app." />
        )}
      </Screen>
    );
  }
  const asking = coach.state.status === 'asking';
  const ask = () => {
    if (task === 'explain_concept') return void coach.ask(sources.concept(term, question));
    if (task === 'extra_practice') return void coach.ask(sources.practice(term));
    if (task === 'review_journal') {
      const e = sources.entries.find((x) => x.id === entryId);
      return e ? void coach.ask(sources.journal(e)) : undefined;
    }
    const r = sources.runs.find((x) => x.id === runId);
    return r ? void coach.ask(sources.backtest(r)) : undefined;
  };
  const canAsk = task === 'explain_concept' || task === 'extra_practice' ? term.trim() !== '' : task === 'review_journal' ? entryId !== null : runId !== null;
  return (
    <Screen testID="coach-screen">
      <AppText variant="title">Coach</AppText>
      {mode === 'cloud' ? (
        <Notice title="Cloud coach: sent to Anthropic" tone="warning">
          Your question and the details listed in Data and AI services are sent to Anthropic with your key. Answers are AI suggestions, can be wrong, and are never advice. If the cloud coach cannot answer, the app’s own lessons are shown instead.
        </Notice>
      ) : (
        <Notice title="Offline coach">Answers come from the app’s own lessons and records. Nothing leaves this phone.</Notice>
      )}
      <Card>
        <SegmentedControl label="What do you want?" options={TASKS} value={task} onChange={(t) => { setTask(t); coach.reset(); }} />
        {task === 'explain_concept' || task === 'extra_practice' ? (
          <>
            <TextField label="Term or concept" value={term} onChangeText={setTerm} placeholder="e.g. spread, stop loss, drawdown" testID="coach-term" />
            {task === 'explain_concept' ? <TextField label="Your question (optional)" value={question} onChangeText={setQuestion} multiline maxLength={MAX_COACH_QUESTION} testID="coach-question" /> : null}
          </>
        ) : null}
        {task === 'review_journal' ? (
          sources.entries.length === 0 ? (
            <AppText color="textSecondary">No journal entries yet.</AppText>
          ) : (
            <ChoiceChips label="Entry" single options={sources.entries.map((e) => ({ value: e.id, label: `${e.instrument} ${e.direction} · ${(e.closedAt ?? e.openedAt ?? '').slice(0, 10)}` }))} selected={entryId ? [entryId] : []} onChange={(v) => setEntryId(v[0] ?? null)} />
          )
        ) : null}
        {task === 'explain_backtest' ? (
          sources.runs.length === 0 ? (
            <AppText color="textSecondary">No backtest runs yet.</AppText>
          ) : (
            <ChoiceChips label="Run" single options={sources.runs.map((r) => ({ value: r.id, label: `${sources.strategyName(r)} v${r.version} · ${r.createdAt.slice(0, 10)}` }))} selected={runId ? [runId] : []} onChange={(v) => setRunId(v[0] ?? null)} />
          )
        ) : null}
        {asking ? (
          <>
            <AppText accessibilityLiveRegion="polite">{coach.state.status === 'asking' && coach.state.cloud ? 'Asking the cloud coach…' : 'Thinking…'}</AppText>
            <Button label="Cancel" variant="secondary" onPress={coach.cancel} />
          </>
        ) : (
          <Button label="Ask" onPress={ask} disabled={!canAsk} disabledReason={task === 'explain_concept' || task === 'extra_practice' ? 'Type a term or topic first.' : task === 'review_journal' ? 'Choose a journal entry first.' : 'Choose a backtest run first.'} />
        )}
      </Card>
      {coach.state.status === 'error' ? (
        <Notice live title="No answer" tone="warning">
          <AppText testID="coach-error">{errorText(coach.state.error)}</AppText>
          <Button label="Try again" variant="secondary" onPress={coach.retry} />
        </Notice>
      ) : null}
      {coach.state.status === 'answered' ? <ReplyCard reply={coach.state.reply} onRetry={coach.retry} /> : null}
    </Screen>
  );
}

function ReplyCard({ reply, onRetry }: { readonly reply: CoachReply; readonly onRetry: () => void }) {
  return (
    <>
      {reply.fallbackReason ? (
        <Notice live title="Shown offline instead" tone="warning">
          <AppText testID="coach-fallback">{reply.fallbackReason}</AppText>
          <Button label="Try the cloud coach again" variant="secondary" onPress={onRetry} />
        </Notice>
      ) : null}
      <Card accent={reply.source === 'cloud' ? 'warning' : undefined}>
        <AppText variant="label" testID="coach-label">{reply.label}</AppText>
        {reply.ungraded ? <AppText variant="caption" color="textSecondary">Practice to think about. Not graded and not counted in your progress.</AppText> : null}
        {reply.paragraphs.map((p, i) => (
          <AppText key={`${i}-${p.slice(0, 12)}`}>{p}</AppText>
        ))}
        {reply.source === 'cloud' ? <AppText variant="caption" color="textSecondary">{`${AI_SUGGESTION_LABEL}: it can be wrong. It is not financial advice, and it does not change any score or result.`}</AppText> : null}
      </Card>
      {reply.facts.length > 0 ? (
        <Card>
          <CardHeader icon={ShieldCheck} tone="neutral" title="From the app (checked by its own code)" />
          {reply.facts.map((f) => (
            <AppText key={f} variant="caption">{`• ${f}`}</AppText>
          ))}
        </Card>
      ) : null}
    </>
  );
}
