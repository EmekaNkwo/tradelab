import { Pressable, StyleSheet, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from './AppText';
import { ChoiceLabel } from './ChoiceLabel';

/** Quiz answer pills are taller than the 44pt minimum so long answers read comfortably. */
const PILL_HEIGHT = 52;
/** An option with a label longer than this is a full-width row: long text in a stadium pill cramps. */
export const LONG_CHOICE_LABEL = 40;

interface ChoiceOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
}

interface ChoiceChipsProps<T extends string | number> {
  readonly label: string;
  readonly options: readonly ChoiceOption<T>[];
  readonly selected: readonly T[];
  readonly onChange: (selected: T[]) => void;
  /** Single choice: tapping selects only that option. */
  readonly single?: boolean;
  /** Prefix for option testIDs: each option gets `<testIDPrefix>-<value>` (used by the Maestro flows). */
  readonly testIDPrefix?: string;
  /** Keep the label for screen readers only. Use it only when equivalent text is already shown (e.g. as the heading above). */
  readonly hideLabel?: boolean;
  /**
   * `chip` (default): wrapping pills; an option with a long label (LONG_CHOICE_LABEL) is a full-width row. `pill`:
   * every option a full-width row, for quiz answers (brief §5.2). Same roles, labels, states and testIDs either way.
   */
  readonly size?: 'chip' | 'pill';
}

/**
 * Wrapping chips for single or multiple choice; selection is shown by fill and a tick, not colour alone.
 * The label is shown above the chips (like TextField's). Each chip also carries the label as its hint, because
 * TalkBack does not read the label of a plain grouping View.
 *
 * Multiple choice has no group role: "list" maps to an Android list that TalkBack announces but cannot move
 * through. The wrapper keeps its accessibilityLabel (a non-focusable View, so TalkBack does not stop on it):
 * tests find the group by it, and testing/a11y.ts checks each chip names it.
 */
export function ChoiceChips<T extends string | number>({ label, options, selected, onChange, single = false, testIDPrefix, hideLabel = false, size = 'chip' }: ChoiceChipsProps<T>) {
  const { colors, radii, spacing } = useTheme();
  // Quiz answers, and any long option, are full-width rows (rounded rectangle, text left, room to wrap). Short
  // options next to them stay pills, so a mixed group doesn't turn into a tall stack.
  const quiz = size === 'pill';
  const toggle = (value: T) => {
    if (single) return onChange([value]);
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  return (
    <ChoiceLabel label={label} hidden={hideLabel}>
      <View accessibilityRole={single ? 'radiogroup' : undefined} accessibilityLabel={label} style={[quiz ? styles.stack : styles.wrap, { gap: spacing.sm }]}>
        {options.map((o) => {
          const on = selected.includes(o.value);
          const rows = quiz || o.label.length > LONG_CHOICE_LABEL;
          return (
            <Pressable
              key={String(o.value)}
              testID={testIDPrefix ? `${testIDPrefix}-${String(o.value)}` : undefined}
              accessibilityRole={single ? 'radio' : 'checkbox'}
              accessibilityLabel={o.label}
              accessibilityHint={label}
              accessibilityState={single ? { selected: on } : { checked: on }}
              onPress={() => toggle(o.value)}
              style={[
                rows ? styles.row : styles.chip,
                {
                  borderRadius: rows ? radii.lg : radii.pill,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: rows ? spacing.md : spacing.xs,
                  borderColor: on ? colors.brand : colors.border,
                  backgroundColor: on ? colors.brand : colors.surface,
                },
              ]}
            >
              <AppText variant={rows ? 'body' : 'label'} style={{ color: on ? colors.onBrand : colors.textPrimary, fontWeight: rows ? '500' : undefined }}>
                {on ? `✓ ${o.label}` : o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </ChoiceLabel>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  stack: { flexDirection: 'column' },
  row: { minHeight: PILL_HEIGHT, alignSelf: 'stretch', width: '100%', justifyContent: 'center', borderWidth: 1 },
  chip: { minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
