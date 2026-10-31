import { Pressable, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import type { LucideIcon } from './icons';
import { pressScale } from './pressFeedback';
import { useReduceMotion } from './useReduceMotion';

interface QuickActionProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  /** The main action of the row: filled brand circle. */
  readonly primary?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

export const QUICK_ACTION_SIZE = 56;

/** A 56pt circular button with an outline icon and its caption below; the whole column is the touch target. */
export function QuickAction({ icon, label, onPress, primary = false, accessibilityHint, testID }: QuickActionProps) {
  const { colors, radii, spacing, elevation } = useTheme();
  const reduceMotion = useReduceMotion();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', gap: spacing.xs, minWidth: QUICK_ACTION_SIZE, minHeight: touchTarget, transform: [{ scale: pressScale(pressed, reduceMotion) }] })}
    >
      <View
        style={{
          width: QUICK_ACTION_SIZE,
          height: QUICK_ACTION_SIZE,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: primary ? colors.brand : colors.surface,
          borderWidth: elevation.cardBorder && !primary ? 1 : 0,
          borderColor: colors.border,
          shadowColor: elevation.shadowColor,
          shadowOpacity: elevation.shadowOpacity,
          shadowRadius: elevation.shadowRadius / 2,
          shadowOffset: elevation.shadowOffset,
          elevation: elevation.elevation,
        }}
      >
        <Icon icon={icon} size={24} literalColor={primary ? colors.onBrand : colors.brand} />
      </View>
      <AppText variant="caption" color="textPrimary" numberOfLines={2} style={{ textAlign: 'center', maxWidth: 76 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
