import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../../theme';
import { AppText } from '../AppText';
import { pillLeft } from './chartMath';

interface ValuePillProps {
  readonly text: string;
  /** Centre of the selected point, in chart coordinates. */
  readonly x: number;
  readonly top: number;
  readonly chartWidth: number;
  /** Light pill on a dark hero card. */
  readonly onDark?: boolean;
  readonly testID?: string;
}

/** The value bubble above the selected point; kept inside the chart. Hidden from screen readers (the chart says it). */
export function ValuePill({ text, x, top, chartWidth, onDark = false, testID }: ValuePillProps) {
  const { colors, radii, spacing } = useTheme();
  const [width, setWidth] = useState(64);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  return (
    <View
      testID={testID}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: pillLeft(x, width, chartWidth),
        top,
        borderRadius: radii.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        backgroundColor: onDark ? colors.onHero : colors.textPrimary,
      }}
    >
      <AppText variant="caption" tabular maxFontSizeMultiplier={1.5} style={{ color: onDark ? colors.heroEnd : colors.surface, fontWeight: '600' }}>
        {text}
      </AppText>
    </View>
  );
}
