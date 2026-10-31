import { Stack, useLocalSearchParams } from 'expo-router';
import { LearnSection, WatchSection } from '../../components/learning/LessonSections';
import { PracticeCard } from '../../components/learning/PracticeCard';
import { DisclosureNotice } from '../../components/lesson/DisclosureNotice';
import { QuestionSequence } from '../../components/learning/QuestionSequence';
import { AppText, ErrorState, LoadingState, Notice, Screen } from '../../components/ui';
import { pickLevelledText, useGrader, useLessonDisclosures, useLessonView, type LessonView, questionView } from '../../features/learning';

/** Read a lesson again outside a class. Practice answers here do not change progress. */
export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const view = useLessonView(id ?? '');
  return (
    <>
      <Stack.Screen options={{ title: 'Lesson' }} />
      {view.status === 'loading' ? <LoadingState /> : null}
      {view.status === 'error' ? (
        <Screen>
          <ErrorState error={view.error} onRetry={view.reload} />
        </Screen>
      ) : null}
      {view.status === 'success' ? <LessonBody view={view.data} /> : null}
    </>
  );
}

function LessonBody({ view }: { readonly view: LessonView }) {
  const { lesson, explanationLevel } = view;
  const grade = useGrader(new Map(lesson.quickCheck.map((q) => [q.id, q])));
  const disclosures = useLessonDisclosures(lesson.id);
  return (
    <Screen testID="lesson-screen">
      <AppText variant="caption" color="textSecondary">{view.moduleTitle}</AppText>
      {disclosures.map((d) => (
        <DisclosureNotice key={d.id} disclosure={d} />
      ))}
      <LearnSection
        title={lesson.title}
        inOneLine={pickLevelledText(lesson.inOneLine, explanationLevel)}
        explanation={pickLevelledText(lesson.explain, explanationLevel)}
        simpler={lesson.explainSimpler}
        commonMistake={lesson.commonMistake}
      />
      <WatchSection example={lesson.realNumbers} another={lesson.anotherExample} />
      <PracticeCard practice={lesson.doItNow} moduleId={lesson.moduleId} />
      <AppText variant="heading">Practice questions</AppText>
      <Notice title="Practice only">
        <AppText>These answers are not scored. Your progress comes from the quizzes in your daily classes.</AppText>
      </Notice>
      <QuestionSequence
        questions={lesson.quickCheck.map(questionView)}
        grade={grade}
        onFirstAttempt={() => undefined}
        onMastered={() => undefined}
        onDone={() => undefined}
        doneMessage="Practice done."
      />
    </Screen>
  );
}
