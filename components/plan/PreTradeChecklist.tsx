import { View } from 'react-native';
import { CHECKLIST, evaluateChecklist, type ChecklistAnswer, type ChecklistAnswers, type ChecklistItemId } from '../../features/plan';
import { useTheme } from '../../theme';
import { AppText, Notice, SegmentedControl } from '../ui';

const ANSWERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' },
] as const;

interface PreTradeChecklistProps {
  readonly answers: ChecklistAnswers;
  readonly onAnswer: (id: ChecklistItemId, answer: ChecklistAnswer) => void;
  /** Items answered from the order itself; shown but not editable. */
  readonly fixed?: readonly ChecklistItemId[];
}

/**
 * Pre-trade checklist (spec §20). Every question needs an answer before the
 * trade can go on; answers that need a second look are listed as cautions,
 * but no answer stops the trade.
 */
export function PreTradeChecklist({ answers, onAnswer, fixed = [] }: PreTradeChecklistProps) {
  const { spacing } = useTheme();
  const result = evaluateChecklist(answers);
  return (
    <View style={{ gap: spacing.sm }} testID="pre-trade-checklist">
      <AppText variant="heading">Before you trade</AppText>
      {CHECKLIST.map((item) => (
        <View key={item.id} style={{ gap: spacing.xs }} testID={`checklist-${item.id}`}>
          {/* The question is the group's visible label, so screen readers and the Maestro flows see the same text. */}
          <SegmentedControl<ChecklistAnswer | ''>
            label={fixed.includes(item.id) ? `${item.question} (answered from your order)` : item.question}
            options={ANSWERS}
            // '' matches no option, so an unanswered question shows nothing selected.
            value={answers[item.id] ?? ''}
            onChange={(v) => {
              if (v !== '') onAnswer(item.id, v);
            }}
            disabled={fixed.includes(item.id)}
            testIDPrefix={`checklist-${item.id}`}
          />
        </View>
      ))}
      <View accessibilityLiveRegion="polite">
        {result.cautions.length > 0 ? (
          <Notice title="Look again before you go on" tone="warning">
            {result.cautions.map((c) => `• ${c.text}`).join('\n')}
          </Notice>
        ) : null}
        {!result.complete ? (
          <AppText color="textSecondary" testID="checklist-unanswered">
            {`${result.unanswered.length} ${result.unanswered.length === 1 ? 'question' : 'questions'} left to answer.`}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
