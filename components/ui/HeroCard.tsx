import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { HERO_SHAPE_OPACITY, useTheme, type Theme } from '../../theme';
import { CARD_MARKER, marker, SimulatedContext } from './simulated';
import { SimulatedBadge, type SimulatedKind } from './SimulatedBadge';

interface HeroCardProps {
  readonly children: ReactNode;
  /** Shown top-right, e.g. a SimulatedBadge or a "This week" pill. */
  readonly pill?: ReactNode;
  /** `strong`: the deep hero gradient. `light`: a lighter brand gradient (Learn's program card). */
  readonly variant?: 'strong' | 'light';
  readonly style?: StyleProp<ViewStyle>;
  /**
   * The hero shows simulated money: renders the SimulatedBadge top-right (beside any `pill`), and figures inside
   * (SplitNumber, PnLValue, StatTile) add "simulated" to what screen readers say.
   */
  readonly simulated?: SimulatedKind;
  readonly testID?: string;
}

/** The gradient stops for a hero variant; white (`onHero`) text meets 4.5:1 on every stop. */
export function heroStops(theme: Theme, variant: 'strong' | 'light'): readonly [string, string] {
  const { colors } = theme;
  return variant === 'light' ? [colors.heroStart, colors.heroSoftEnd] : [colors.heroStart, colors.heroEnd];
}

/**
 * Diagonal gradient card (radius 24) with a quiet, original abstract shape (a dark tint, so white text over it
 * keeps its contrast). Put `onHero` text in
 * it. Not a bank card: no card number, chip or brand mark, ever.
 */
export function HeroCard({ children, pill, variant = 'strong', style, simulated, testID }: HeroCardProps) {
  const theme = useTheme();
  const { radii, spacing } = theme;
  return (
    <View {...marker(CARD_MARKER)} testID={testID} style={[{ borderRadius: radii.hero, overflow: 'hidden' }, style]}>
      <LinearGradient colors={heroStops(theme, variant)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.shape} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={180} height={180} viewBox="0 0 180 180">
          <Circle cx={130} cy={50} r={70} fill="#000000" opacity={HERO_SHAPE_OPACITY} />
          <Circle cx={160} cy={130} r={46} fill="#000000" opacity={HERO_SHAPE_OPACITY} />
        </Svg>
      </View>
      <View style={{ padding: spacing.screen, gap: spacing.md }}>
        {pill || simulated ? (
          <View style={[styles.pill, { gap: spacing.sm }]}>
            {simulated ? <SimulatedBadge kind={simulated} /> : null}
            {pill}
          </View>
        ) : null}
        <SimulatedContext.Provider value={simulated ?? null}>{children}</SimulatedContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shape: { position: 'absolute', top: 0, right: 0 },
  pill: { alignSelf: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
});
