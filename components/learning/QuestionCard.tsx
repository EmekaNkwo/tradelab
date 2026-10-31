import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ChoiceChips } from '../ui/ChoiceChips';
import { Icon } from '../ui/Icon';
import { CircleAlert, CircleCheck } from '../ui/icons';
import { stripGlossaryLinks } from '../lesson/DisclosureNotice';

export interface QuestionView {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly multiple: boolean;
}

export interface Verdict {
  readonly correct: boolean;
  readonly feedback: readonly string[];
}

interface QuestionCardProps {
  readonly question: QuestionView;
  /** Grades a submission; the card never knows the answer key itself. */
  readonly grade: (chosen: readonly string[]) => Verdict;
  /** Called once, with the first submission. */
  readonly onFirstAttempt: (chosen: readonly string[], correct: boolean) => void;
  /** Called when the learner answers correctly (on any attempt) and continues. */
  readonly onMastered: () => void;
  readonly continueLabel?: string;
  /** Checkpoints: one attempt only, no retry. */
  readonly allowRetry?: boolean;
}

/**
 * One question with instant feedback, "Why was I wrong?" and "Let me try
 * again" (spec §7.2). Feedback explains every chosen option, not just a verdict.
 */
export function QuestionCard({ question, grade, onFirstAttempt, onMastered, continueLabel = 'Continue', allowRetry = true }: QuestionCardProps) {
  const { spacing } = useTheme();
  const [chosen, setChosen] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [showWhy, setShowWhy] = useState(false);

  const submit = () => {
    const v = grade(chosen);
    if (attempts === 0) onFirstAttempt(chosen, v.correct);
    setAttempts((a) => a + 1);
    setVerdict(v);
    setShowWhy(v.correct);
  };
  const retry = () => {
    setChosen([]);
    setVerdict(null);
    setShowWhy(false);
  };

  return (
    <Card>
      <AppText variant="heading">{stripGlossaryLinks(question.prompt)}</AppText>
      {question.multiple ? (
        <AppText variant="caption" color="textSecondary">
          Choose all that apply.
        </AppText>
      ) : null}
      <ChoiceChips
        label={stripGlossaryLinks(question.prompt)}
        hideLabel
        single={!question.multiple}
        options={question.options.map((o) => ({ value: o.id, label: stripGlossaryLinks(o.text) }))}
        selected={chosen}
        testIDPrefix={`option-${question.id}`}
        size="pill"
        onChange={(next) => (verdict ? undefined : setChosen(next))}
      />
      {verdict ? (
        <View style={{ gap: spacing.sm }} accessibilityLiveRegion="polite">
          {/* Calm: an icon and words, no celebration (brief §1, §7). */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon icon={verdict.correct ? CircleCheck : CircleAlert} size={18} color={verdict.correct ? 'brand' : 'warning'} />
            <AppText variant="label" color={verdict.correct ? 'brand' : 'warning'}>
              {verdict.correct ? '✓ Correct' : '✗ Not quite'}
            </AppText>
          </View>
          {showWhy ? verdict.feedback.map((f) => <AppText key={f}>{stripGlossaryLinks(f)}</AppText>) : null}
          {verdict.correct || !allowRetry ? (
            <>
              {!verdict.correct && !showWhy ? <Button label="Why was I wrong?" variant="secondary" onPress={() => setShowWhy(true)} /> : null}
              <Button label={continueLabel} onPress={onMastered} />
            </>
          ) : (
            <>
              {!showWhy ? <Button label="Why was I wrong?" variant="secondary" onPress={() => setShowWhy(true)} /> : null}
              <Button label="Let me try again" onPress={retry} />
            </>
          )}
        </View>
      ) : (
        <Button label="Check answer" onPress={submit} disabled={chosen.length === 0} disabledReason="Choose an answer first." />
      )}
    </Card>
  );
}
