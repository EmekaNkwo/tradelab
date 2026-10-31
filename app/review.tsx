import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { QuestionSequence } from '../components/learning/QuestionSequence';
import { AppText, Button, EmptyState, ErrorState, LoadingState, Notice, Screen } from '../components/ui';
import { useGrader, useReviewSession, questionView } from '../features/learning';

export default function ReviewScreen() {
  const session = useReviewSession();
  const [done, setDone] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const due = session.due;
  const questions = due.status === 'success' ? due.data : [];
  const grade = useGrader(new Map(questions.map((q) => [q.id, q])));

  const finish = async () => {
    setDone(true);
    const r = await session.save();
    setSaveFailed(!r.ok);
  };

  return (
    <Screen testID="review-screen">
      <Stack.Screen options={{ title: 'Review' }} />
      {due.status === 'loading' ? <LoadingState /> : null}
      {due.status === 'error' ? <ErrorState error={due.error} onRetry={due.reload} /> : null}
      {due.status === 'success' && questions.length === 0 ? <EmptyState title="Nothing to review" body="You are up to date. Concepts come back here when they are due." /> : null}
      {due.status === 'success' && questions.length > 0 && !done ? (
        <>
          <AppText color="textSecondary">Concepts you met earlier come back just before you would forget them.</AppText>
          <QuestionSequence
            questions={questions.map(questionView)}
            grade={grade}
            onFirstAttempt={(id, _c, correct) => session.answer(id, correct)}
            onMastered={() => undefined}
            onDone={() => void finish()}
          />
        </>
      ) : null}
      {done ? (
        <>
          <Notice live title={saveFailed ? 'Not saved' : 'Review saved'} tone={saveFailed ? 'warning' : 'success'}>
            <AppText>
              {saveFailed
                ? 'Your answers could not be saved. Please try again later.'
                : `${session.answers.filter((a) => a.correct).length} of ${session.answers.length} right first time.`}
            </AppText>
          </Notice>
          <Button label="Back to Home" onPress={() => router.back()} />
        </>
      ) : null}
    </Screen>
  );
}
