import { View } from 'react-native';
import type { LabExercise, OptionVerdict } from '../../features/labs';
import { useTheme } from '../../theme';
import { GlossaryText } from '../lesson/GlossaryText';
import { stripGlossaryLinks } from '../lesson/DisclosureNotice';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ChoiceChips } from '../ui/ChoiceChips';
import { Notice } from '../ui/Notice';

export interface PickOption {
  readonly id: string;
  readonly text: string;
  readonly explanation: string;
}

export type VerdictLabels = Readonly<Record<OptionVerdict, string>>;

interface PickExerciseProps {
  readonly question: string;
  /** In display order (already shuffled). */
  readonly options: readonly PickOption[];
  readonly exercise: LabExercise;
  readonly labels: VerdictLabels;
  readonly checkLabel: string;
}

const GOOD: ReadonlySet<OptionVerdict> = new Set(['found', 'rightly_left']);

/**
 * "Pick all that apply" with every option judged after checking: what was
 * found, missed, picked wrongly or rightly left, each with its reason.
 */
export function PickExercise({ question, options, exercise, labels, checkLabel }: PickExerciseProps) {
  const { spacing } = useTheme();
  const { mark } = exercise;
  return (
    <Card>
      <AppText variant="heading">{stripGlossaryLinks(question)}</AppText>
      <AppText variant="caption" color="textSecondary">Choose all that apply. You can also choose none.</AppText>
      <ChoiceChips
        label={stripGlossaryLinks(question)}
        hideLabel
        options={options.map((o) => ({ value: o.id, label: stripGlossaryLinks(o.text) }))}
        selected={exercise.picked}
        onChange={(next) => {
          const added = next.find((id) => !exercise.picked.includes(id));
          const removed = exercise.picked.find((id) => !next.includes(id));
          const changed = added ?? removed;
          if (changed) exercise.toggle(changed);
        }}
      />
      {mark ? (
        <View style={{ gap: spacing.sm }} accessibilityLiveRegion="polite" testID="pick-result">
          <AppText variant="label">{`${mark.correct} of ${mark.total} judged correctly`}</AppText>
          {options.map((o) => {
            const verdict = mark.verdicts[o.id] ?? 'rightly_left';
            return (
              <View key={o.id} style={{ gap: spacing.xs }} testID={`verdict-${o.id}`}>
                <AppText variant="label" color={GOOD.has(verdict) ? 'brand' : 'lossText'}>{`${GOOD.has(verdict) ? '✓' : '✗'} ${labels[verdict]}`}</AppText>
                <AppText color="textSecondary">{stripGlossaryLinks(o.text)}</AppText>
                <GlossaryText>{o.explanation}</GlossaryText>
              </View>
            );
          })}
          {exercise.error ? <Notice live title="Not saved" tone="warning">Your answer was marked but could not be saved, so it will not show in your record.</Notice> : null}
          <Button label="Try it again" variant="secondary" onPress={exercise.reset} />
        </View>
      ) : (
        <Button label={exercise.picked.length === 0 ? `${checkLabel} (I picked none)` : checkLabel} onPress={exercise.check} busy={exercise.saving} />
      )}
    </Card>
  );
}
