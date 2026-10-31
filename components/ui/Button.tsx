import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ArrowRight } from './icons';
import { pressScale } from './pressFeedback';
import { useReduceMotion } from './useReduceMotion';

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** `hero`: a white pill with a trailing arrow, for the one action on a HeroCard gradient. */
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'hero';
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly accessibilityHint?: string;
  /** What a screen reader says, when the visible label is a symbol (e.g. "+"). */
  readonly accessibilityLabel?: string;
  /**
   * Why the button can't be used yet (spec §38: no unexplained dead controls). Shown as text under the button
   * while it is disabled (screen readers reach it next), not shown while it is only busy.
   */
  readonly disabledReason?: string;
  readonly testID?: string;
  /** For show/hide toggles: whether the section it controls is open. */
  readonly expanded?: boolean;
}

export function Button({ label, onPress, variant = 'primary', disabled = false, busy = false, accessibilityHint, accessibilityLabel, disabledReason, testID, expanded }: ButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  const inactive = disabled || busy;
  const hero = variant === 'hero';
  const filled = variant !== 'secondary';
  const fill = hero ? colors.onHero : variant === 'danger' ? colors.lossText : colors.brand;
  // The hero pill stays white when pressed (the scale is the feedback): every tint would drop its ink below 4.5:1.
  const pressedFill = hero ? colors.onHero : variant === 'danger' ? colors.lossStrong : colors.brandStrong;
  const reason = disabled && !busy && disabledReason ? disabledReason : undefined;
  const fg = hero ? colors.heroEnd : filled ? colors.onBrand : colors.brand;

  const button = (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={reason ? undefined : accessibilityHint}
      accessibilityState={{ disabled: inactive, busy, expanded }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: radii.pill,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.sm,
          backgroundColor: filled ? (pressed ? pressedFill : fill) : pressed ? colors.brandTint : colors.surface,
          borderColor: filled ? fill : colors.border,
          opacity: inactive ? 0.55 : 1,
          transform: [{ scale: pressScale(pressed, reduceMotion) }],
        },
      ]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={fg} style={{ marginRight: spacing.sm }} /> : null}
        <AppText variant="label" style={[styles.label, { color: fg }]}>
          {label}
        </AppText>
        {hero ? <Icon icon={ArrowRight} size={18} literalColor={fg} /> : null}
      </View>
    </Pressable>
  );
  if (!reason) return button;
  return (
    <View style={{ gap: spacing.xs }}>
      {button}
      <AppText variant="caption" color="textSecondary">
        {reason}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: touchTarget + 4, minWidth: touchTarget, justifyContent: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  label: { textAlign: 'center', flexShrink: 1 },
});
