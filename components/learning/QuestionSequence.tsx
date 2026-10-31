import { useState } from 'react';
import { AppText } from '../ui/AppText';
import { Card } from '../ui/Card';
import { QuestionCard, type QuestionView, type Verdict } from './QuestionCard';

interface QuestionSequenceProps {
  readonly questions: readonly QuestionView[];
  readonly grade: (questionId: string, chosen: readonly string[]) => Verdict;
  readonly onFirstAttempt: (questionId: string, chosen: readonly string[], correct: boolean) => void;
  readonly onMastered: (questionId: string) => void;
  /** Called after the last question is completed. */
  readonly onDone: () => void;
  readonly allowRetry?: boolean;
  readonly doneMessage?: string;
}

/** Shows questions one at a time; moves on when the learner continues past each. */
export function QuestionSequence({ questions, grade, onFirstAttempt, onMastered, onDone, allowRetry = true, doneMessage = 'All done.' }: QuestionSequenceProps) {
  const [position, setPosition] = useState(0);
  // First-attempt choice of the current question (checkpoints have no retry).
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const current = questions[position];

  if (!current) {
    return (
      <Card>
        <AppText>{doneMessage}</AppText>
      </Card>
    );
  }
  return (
    <>
      <AppText variant="caption" color="textSecondary">{`Question ${position + 1} of ${questions.length}`}</AppText>
      <QuestionCard
        key={current.id}
        question={current}
        allowRetry={allowRetry}
        grade={(c) => grade(current.id, c)}
        onFirstAttempt={(c, correct) => {
          setChosen(c);
          onFirstAttempt(current.id, c, correct);
        }}
        continueLabel={position === questions.length - 1 ? 'Finish' : 'Next question'}
        onMastered={() => {
          // With retry, Continue appears only once the answer is right; without it, only a right first attempt counts.
          if (allowRetry || grade(current.id, chosen).correct) onMastered(current.id);
          const next = position + 1;
          setPosition(next);
          if (next >= questions.length) onDone();
        }}
      />
    </>
  );
}
