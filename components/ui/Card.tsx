import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type ColorTokens, type Theme } from '../../theme';
import { CARD_MARKER, marker } from './simulated';

interface CardProps {
  readonly children: ReactNode;
  /** Optional accent outline, e.g. a mode colour so learning/replay/paper/MT look distinct. */
  readonly accent?: keyof ColorTokens;
  readonly style?: StyleProp<ViewStyle>;
  /** Screen readers announce changes to this card (e.g. a calculator result). */
  readonly liveRegion?: boolean;
  /** `card` (radius 20, on the screen background) or `tile` (radius 16, muted fill, inside a card). */
  readonly variant?: 'card' | 'tile';
  readonly testID?: string;
}

/** Light: soft low shadow, no border. Dark: a subtle hairline instead of a shadow (brief §2). */
export function cardSurface(theme: Theme, variant: 'card' | 'tile' = 'card'): ViewStyle {
  const { colors, radii, elevation } = theme;
  if (variant === 'tile') return { backgroundColor: colors.surfaceMuted, borderRadius: radii.tile };
  return {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: elevation.cardBorder ? 1 : 0,
    borderColor: colors.border,
    shadowColor: elevation.shadowColor,
    shadowOpacity: elevation.shadowOpacity,
    shadowRadius: elevation.shadowRadius,
    shadowOffset: elevation.shadowOffset,
    elevation: elevation.elevation,
  };
}

export function Card({ children, accent, style, liveRegion = false, variant = 'card', testID }: CardProps) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  return (
    <View
      {...marker(CARD_MARKER)}
      testID={testID}
      accessibilityLiveRegion={liveRegion ? 'polite' : undefined}
      style={[
        cardSurface(theme, variant),
        { padding: spacing.lg, gap: spacing.sm },
        // An accent outlines the whole card softly; no side stripe. `80` is 50% alpha appended to a #RRGGBB token
        // (every palette colour is six-digit hex; theme/__tests__/contrast.test.ts checks it).
        accent ? { borderWidth: 1.5, borderColor: `${colors[accent]}80` } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
