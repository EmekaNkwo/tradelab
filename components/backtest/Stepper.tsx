import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText, Button } from '../ui';

interface StepperProps {
  readonly label: string;
  readonly value: number;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly format?: (value: number) => string;
  readonly testID?: string;
  /** Leave out the visible name when the same label is already shown right above (the buttons still say it). */
  readonly hideLabel?: boolean;
}

/** A number changed only by tapping, so it is always valid and within its limits. */
export function Stepper({ label, value, step, min, max, onChange, format = String, testID, hideLabel = false }: StepperProps) {
  const { spacing } = useTheme();
  const move = (delta: number) => onChange(Math.min(max, Math.max(min, Math.round((value + delta) * 100) / 100)));
  return (
    <View style={[styles.row, { gap: spacing.sm }]} testID={testID} accessible={false}>
      {hideLabel ? null : <AppText style={styles.label}>{label}</AppText>}
      <Button label="−" accessibilityLabel={`Lower ${label}`} variant="secondary" onPress={() => move(-step)} disabled={value <= min} accessibilityHint={value <= min ? 'Already at the lowest value' : undefined} />
      <AppText variant="label" accessibilityLiveRegion="polite" testID={testID ? `${testID}-value` : undefined} style={styles.value}>
        {format(value)}
      </AppText>
      <Button label="+" accessibilityLabel={`Raise ${label}`} variant="secondary" onPress={() => move(step)} disabled={value >= max} accessibilityHint={value >= max ? 'Already at the highest value' : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  label: { flexGrow: 1, flexShrink: 1, minWidth: 120 },
  value: { minWidth: 56, textAlign: 'center' },
});
