import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { heroBarColor, touchTarget, useTheme } from '../../../theme';
import { AppText } from '../AppText';
import { barFractions, chartSummary, clampSelection, finitePoints, type ChartPoint } from './chartMath';

interface BarActivityChartProps {
  /** e.g. "Study minutes per day, this week". Starts the spoken summary. */
  readonly title: string;
  readonly points: readonly ChartPoint[];
  readonly format: (value: number) => string;
  /** On a dark hero card: white bars and pill. */
  readonly onDark?: boolean;
  readonly height?: number;
  /** Starts on the last bar. */
  readonly initialIndex?: number;
  readonly onSelect?: (index: number) => void;
  readonly testID?: string;
}

const PILL_SPACE = 30;

/**
 * Rounded bars with a value pill over the selected bar. Each bar is its own button ("Wed, 35 min"), so screen
 * readers and switch users can reach every value (each at least 44pt wide); a hidden summary element carries the
 * whole chart as text.
 */
export function BarActivityChart({ title, points: rawPoints, format, onDark = false, height = 140, initialIndex, onSelect, testID }: BarActivityChartProps) {
  const { colors, radii, spacing } = useTheme();
  const points = finitePoints(rawPoints);
  const [chosen, setChosen] = useState<number | null>(null);
  const selected = clampSelection(chosen, initialIndex, points.length);
  const fractions = barFractions(points.map((p) => p.value));
  const plot = height - PILL_SPACE;
  const barColor = (on: boolean) => (onDark ? (on ? colors.onHero : heroBarColor) : on ? colors.brandStrong : colors.brand);
  const textColor = onDark ? colors.onHero : colors.textSecondary;

  if (points.length === 0) {
    return (
      <AppText testID={testID} style={{ color: textColor }}>
        No activity yet.
      </AppText>
    );
  }
  return (
    <View testID={testID}>
      {/* The chart's text summary: one focusable element, visually hidden (the bars and labels show the same). */}
      <View testID={testID ? `${testID}-summary` : undefined} accessible accessibilityRole="summary" accessibilityLabel={chartSummary(title, points, format)} style={styles.srOnly} />
      {/* Every bar keeps a full 44pt touch width: the bars share the width when they fit and scroll when they don't. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
        {points.map((p, i) => {
          const on = i === selected;
          const barHeight = Math.max(p.value > 0 ? 6 : 2, fractions[i]! * (plot - 4));
          return (
            <Pressable
              key={`${p.label}-${i}`}
              testID={testID ? `${testID}-bar-${i}` : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}, ${format(p.value)}`}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setChosen(i);
                onSelect?.(i);
              }}
              style={[styles.column, { gap: spacing.xs }]}
            >
              <View style={{ height, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                {on ? (
                  <View
                    style={{ position: 'absolute', top: 0, borderRadius: radii.pill, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, backgroundColor: onDark ? colors.onHero : colors.textPrimary }}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <AppText variant="caption" tabular numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ color: onDark ? colors.heroEnd : colors.surface, fontWeight: '600' }}>
                      {format(p.value)}
                    </AppText>
                  </View>
                ) : null}
                <View testID={testID ? `${testID}-fill-${i}` : undefined} style={{ width: '64%', maxWidth: 28, height: barHeight, borderRadius: radii.sm + 2, backgroundColor: barColor(on) }} />
              </View>
              <AppText variant="caption" numberOfLines={1} style={{ textAlign: 'center', color: textColor, fontWeight: on ? '700' : '500' }}>
                {p.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Minimum touch width of each bar (spec §31). */
export const BAR_TOUCH_WIDTH = touchTarget;

const styles = StyleSheet.create({
  track: { flexGrow: 1 },
  column: { flex: 1, minWidth: BAR_TOUCH_WIDTH, minHeight: touchTarget, alignItems: 'center' },
  // No opacity: 0 here; Android and iOS skip fully transparent views, so screen readers could not reach it.
  srOnly: { position: 'absolute', width: 1, height: 1 },
});
