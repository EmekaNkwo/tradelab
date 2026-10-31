import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DisclosureNotice, stripGlossaryLinks } from '../../components/lesson/DisclosureNotice';
import { LearnSection, WatchSection } from '../../components/learning/LessonSections';
import { PracticeCard } from '../../components/learning/PracticeCard';
import { QuestionSequence } from '../../components/learning/QuestionSequence';
import type { QuestionView } from '../../components/learning/QuestionCard';
import { AppText, Button, Card, CardHeader, ErrorState, IconWell, LoadingState, Notice, Screen, TextField } from '../../components/ui';
import { CircleCheck, NotebookPen } from '../../components/ui/icons';
import {
  pickLevelledText,
  SECTION_TITLES,
  useClassRunner,
  useClassSession,
  useGrader,
  useLearningActions,
  useLessonDisclosures,
  useNotes,
  questionView,
  type ClassSession,
  type ClassSection,
} from '../../features/learning';
import { useTheme } from '../../theme';

export default function ClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useClassSession(id ?? '');
  return (
    <>
      <Stack.Screen options={{ title: 'Class' }} />
      {session.status === 'loading' ? <LoadingState label="Preparing your class…" /> : null}
      {session.status === 'error' ? (
        <Screen>
          <ErrorState error={session.error} onRetry={session.reload} />
        </Screen>
      ) : null}
      {session.status === 'success' ? <ClassRunner session={session.data} /> : null}
    </>
  );
}

function toView(q: { id: string; prompt: string; options: readonly { id: string; text: string }[]; correctOptionIds: readonly string[] }): QuestionView {
  return questionView(q);
}

function ClassRunner({ session }: { readonly session: ClassSession }) {
  const run = useClassRunner(session);
  const { spacing } = useTheme();
  const { begin } = run;
  useEffect(() => {
    void begin();
  }, [begin]);

  const section = run.section;
  const total = session.sections.length;
  return (
    <Screen testID="class-screen">
      <Stack.Screen options={{ title: run.readOnly ? 'Class (review)' : `Class ${session.cls.index + 1}` }} />
      {run.readOnly ? (
        <Notice title="Completed class">
          <AppText>You are re-opening a finished class. Answers here are for practice and are not saved.</AppText>
        </Notice>
      ) : null}
      {run.error ? <ErrorState error={run.error} onRetry={run.dismissError} /> : null}
      <AppText variant="caption" color="textSecondary" testID="section-progress">
        {section ? `${SECTION_TITLES[section.kind]} · ${run.index + 1} of ${total}` : ''}
      </AppText>
      {section ? <SectionBar done={run.index + 1} total={total} /> : null}
      {section ? <SectionView key={`${run.index}`} session={session} section={section} run={run} /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {run.index > 0 ? (
          <View style={{ flex: 1 }}>
            <Button label="Back" variant="secondary" onPress={() => run.goTo(run.index - 1)} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button label="Pause" variant="secondary" accessibilityHint="Saves your place so you can continue later" onPress={() => router.back()} />
        </View>
      </View>
      <NotesCard classId={session.cls.id} readOnly={run.readOnly} />
    </Screen>
  );
}

type Runner = ReturnType<typeof useClassRunner>;

function SectionView({ session, section, run }: { readonly session: ClassSession; readonly section: ClassSection; readonly run: Runner }) {
  const grade = useGrader(session.questions);
  const actions = useLearningActions();
  const [assessedDone, setAssessedDone] = useState(false);
  const next = () => run.goTo(run.index + 1);
  const level = session.explanationLevel;
  const disclosures = useLessonDisclosures(section.kind === 'learn' ? section.lessonId : null);
  const lesson = (id: string) => session.lessons.find((l) => l.id === id);
  const questions = (ids: readonly string[]) => ids.map((id) => session.questions.get(id)).filter((q) => q !== undefined).map(toView);
  const continueButton = <Button label="Continue" onPress={next} testID="section-next" />;

  switch (section.kind) {
    case 'warmup':
      return (
        <>
          <AppText variant="heading">Quick review of earlier ideas</AppText>
          <QuestionSequence
            questions={questions(section.questionIds)}
            grade={grade}
            onFirstAttempt={(id, _c, correct) => run.answerWarmup(id, correct)}
            onMastered={() => undefined}
            onDone={() => setAssessedDone(true)}
            doneMessage="Warm-up done."
          />
          {assessedDone ? continueButton : <Button label="Skip warm-up" variant="secondary" onPress={next} testID="section-skip" />}
        </>
      );
    case 'learn': {
      const l = lesson(section.lessonId);
      if (!l) return continueButton;
      return (
        <>
          {disclosures.map((d) => (
            <DisclosureNotice key={d.id} disclosure={d} />
          ))}
          <LearnSection
            title={l.title}
            inOneLine={pickLevelledText(l.inOneLine, level)}
            explanation={pickLevelledText(l.explain, level)}
            simpler={l.explainSimpler}
            commonMistake={l.commonMistake}
          />
          {continueButton}
        </>
      );
    }
    case 'watch': {
      const l = lesson(section.lessonId);
      return (
        <>
          {l ? <WatchSection example={l.realNumbers} another={l.anotherExample} /> : null}
          {continueButton}
        </>
      );
    }
    case 'practise': {
      const l = lesson(section.lessonId);
      return (
        <>
          {l ? <PracticeCard practice={l.doItNow} moduleId={l.moduleId} /> : null}
          <Button label="I've done this" onPress={next} testID="section-next" />
          <Button label="Skip for now" variant="secondary" onPress={next} testID="section-skip" />
        </>
      );
    }
    case 'quiz':
      return (
        <>
          <AppText variant="heading">Check your understanding</AppText>
          <QuestionSequence
            questions={section.lessonIds.flatMap((id) => lesson(id)?.quickCheck ?? []).map(toView)}
            grade={grade}
            onFirstAttempt={(id, chosen) => run.answerFirst(id, chosen)}
            onMastered={run.markMastered}
            onDone={() => setAssessedDone(true)}
            doneMessage="Quiz complete. Every answer is right."
          />
          {assessedDone ? continueButton : null}
        </>
      );
    case 'checkpoint':
      return <CheckpointView session={session} run={run} />;
    case 'homework': {
      const l = lesson(section.lessonId);
      return (
        <>
          <Card>
            <CardHeader icon={NotebookPen} title="Homework (optional)" />
            <AppText>{l?.homework ?? ''}</AppText>
          </Card>
          <Button
            label="I've done it"
            testID="section-next"
            onPress={() => {
              void actions.markMission('homework');
              next();
            }}
          />
          <Button label="I'll do it later" variant="secondary" onPress={next} testID="section-skip" />
        </>
      );
    }
    case 'summary':
      return <SummaryView session={session} run={run} />;
  }
}

function CheckpointView({ session, run }: { readonly session: ClassSession; readonly run: Runner }) {
  const grade = useGrader(session.questions);
  const [attempt, setAttempt] = useState(0);
  const checkpoint = run.results.checkpoint;

  if (run.outcome && checkpoint) {
    return (
      <>
        <Notice live title={checkpoint.result.passed ? 'Checkpoint passed' : 'Not passed yet'} tone={checkpoint.result.passed ? 'success' : 'warning'}>
          <AppText>{`You scored ${Math.round(checkpoint.result.score * 100)}%. You need 80% to pass.`}</AppText>
          {!checkpoint.result.passed ? <AppText>Review the questions you missed, then try again. Your place in the program is kept.</AppText> : null}
        </Notice>
        {checkpoint.result.results
          .filter((r) => !r.correct)
          .map((r) => (
            <Card key={r.questionId}>
              <AppText variant="label">{stripGlossaryLinks(session.questions.get(r.questionId)?.prompt ?? '')}</AppText>
              {r.feedback.map((f) => (
                <AppText key={f}>{stripGlossaryLinks(f)}</AppText>
              ))}
            </Card>
          ))}
        {checkpoint.result.passed ? (
          <Button label="Continue" onPress={() => run.goTo(run.index + 1)} testID="section-next" />
        ) : (
          <Button
            label="Try the checkpoint again"
            onPress={() => {
              run.retakeCheckpoint();
              setAttempt((a) => a + 1);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <AppText variant="heading">Module checkpoint</AppText>
      <AppText color="textSecondary">Pass with 80% or more to complete the module. One try per question; you can retake the whole checkpoint.</AppText>
      <QuestionSequence
        key={attempt}
        questions={session.checkpointQuestions.map(toView)}
        grade={grade}
        allowRetry={false}
        onFirstAttempt={(id, chosen) => run.answerCheckpoint(id, chosen)}
        onMastered={() => undefined}
        onDone={() => void run.finish()}
        doneMessage="Saving your result…"
      />
    </>
  );
}

function SummaryView({ session, run }: { readonly session: ClassSession; readonly run: Runner }) {
  const { spacing } = useTheme();
  const remember = session.lessons[0];
  const scorePct = run.outcome?.score ?? run.results.lessonChecks[0]?.firstResult.score ?? null;
  const done = run.readOnly || run.outcome?.finished === true;
  return (
    <>
      <Card testID="class-summary">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconWell icon={CircleCheck} size={40} />
          <AppText variant="title" style={{ flex: 1 }}>
            Class summary
          </AppText>
        </View>
        {session.lessons.map((l) => (
          <AppText key={l.id}>{`✓ ${l.title}`}</AppText>
        ))}
        {scorePct !== null ? <AppText tabular accessibilityLabel={`First-try score, ${Math.round(scorePct * 100)} percent`}>{`First-try score: ${Math.round(scorePct * 100)}%`}</AppText> : null}
        {remember ? (
          <Notice title="One thing to remember">
            <AppText>{stripGlossaryLinks(pickLevelledText(remember.inOneLine, session.explanationLevel))}</AppText>
          </Notice>
        ) : null}
      </Card>
      {done ? (
        <Button label="Back to Home" onPress={() => router.replace('/home')} testID="class-back-home" />
      ) : (
        <Button label="Finish class" busy={run.busy} onPress={() => void run.finish()} testID="class-finish" />
      )}
    </>
  );
}

function NotesCard({ classId, readOnly }: { readonly classId: string; readonly readOnly: boolean }) {
  const notes = useNotes(classId);
  const actions = useLearningActions();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const r = await actions.addNote(classId, draft);
    if (!r.ok) return setError('Write something first (up to 4,000 characters).');
    setDraft('');
    setError(null);
    void actions.markMission('class_note');
  };
  return (
    <Card>
      <CardHeader icon={NotebookPen} tone="neutral" title="Notes" />
      {notes.status === 'success'
        ? notes.data.map((n) => (
            <AppText key={n.id} testID="class-note">
              {n.body}
            </AppText>
          ))
        : null}
      {!readOnly ? (
        <>
          <TextField label="Add a note" value={draft} onChangeText={setDraft} multiline maxLength={4000} error={error} testID="note-input" />
          <Button label="Save note" variant="secondary" onPress={save} disabled={draft.trim().length === 0} disabledReason="Write a note first." />
        </>
      ) : null}
    </Card>
  );
}

/** Where the learner is in the class, as a thin bar; the caption above says it in words. */
function SectionBar({ done, total }: { readonly done: number; readonly total: number }) {
  const { colors, radii } = useTheme();
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
      <View style={{ width: `${percent}%`, height: '100%', borderRadius: radii.pill, backgroundColor: colors.brand }} />
    </View>
  );
}
