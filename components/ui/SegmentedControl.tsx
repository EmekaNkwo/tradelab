import { Pressable, StyleSheet, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from './AppText';
import { ChoiceLabel } from './ChoiceLabel';

interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SegmentedControlProps<T extends string> {
  readonly label: string;
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  /** Keep the label for screen readers only. Use it only when equivalent text is already shown (e.g. as the heading above). */
  readonly hideLabel?: boolean;
  /** Prefix for segment testIDs: each segment gets `<testIDPrefix>-<value>` (used by the Maestro flows). */
  readonly testIDPrefix?: string;
}

/** One choice from a row of segments. The label is shown above; each segment carries it as its hint for TalkBack. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false, hideLabel = false, testIDPrefix }: SegmentedControlProps<T>) {
  const { colors, radii, spacing } = useTheme();
  return (
    <ChoiceLabel label={label} hidden={hideLabel}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.row, { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill }]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={label}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={[styles.segment, { padding: spacing.sm, borderRadius: radii.pill, backgroundColor: selected ? colors.brand : 'transparent' }]}
            >
              <AppText variant="label" style={{ color: selected ? colors.onBrand : colors.textPrimary }}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </ChoiceLabel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', padding: 4, gap: 4 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: touchTarget },
});
