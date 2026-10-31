import { Canvas, Path } from '@shopify/react-native-skia';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useTheme, type ColorTokens } from '../../theme';
import { AppText } from '../ui';

interface LineChartProps {
  readonly title: string;
  readonly values: readonly number[];
  /** Text read by screen readers and shown under the chart, e.g. "from 10,000 to 12,300 USD". */
  readonly summary: string;
  /** Shown instead of the plain summary, e.g. with its amounts marked as money; `summary` stays the spoken text. */
  readonly summaryContent?: ReactNode;
  readonly tone?: keyof ColorTokens;
  /** Draws downwards from the top (for drawdowns). */
  readonly inverted?: boolean;
  readonly height?: number;
  readonly testID?: string;
}

/** SVG path for a series scaled into a box. Exported for tests. */
export function linePath(values: readonly number[], width: number, height: number, inverted = false): string {
  if (values.length < 2 || width <= 0 || height <= 0) return '';
  const min = inverted ? 0 : Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const h = height - pad * 2;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const t = (v - min) / span;
      const y = pad + (inverted ? t * h : (1 - t) * h);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}

const DASH = 2;
const GAP = 4;

/** Dotted horizontal guides at a quarter, half and three quarters of the height, as short dashes. */
export function gridPath(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '';
  const dashes = Array.from({ length: Math.ceil(width / (DASH + GAP)) }, (_, i) => i * (DASH + GAP));
  return [0.25, 0.5, 0.75]
    .map((f) => {
      const y = (height * f).toFixed(1);
      return dashes.map((x) => `M${x} ${y}L${Math.min(width, x + DASH)} ${y}`).join('');
    })
    .join('');
}

/**
 * A small line chart for equity and drawdown curves (restyle brief §5.5): a muted tile with a dotted grid and a
 * smooth-weight line. Equity uses the neutral ink (`textPrimary`), so simulated money never looks like brand.
 */
export function LineChart({ title, values, summary, summaryContent, tone = 'textPrimary', inverted = false, height = 140, testID }: LineChartProps) {
  const { colors, spacing, radii } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const d = linePath(values, width, height, inverted);
  return (
    <View style={{ gap: spacing.xs }} testID={testID}>
      <AppText variant="label">{title}</AppText>
      <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={`${title}: ${summary}`} style={{ height, borderRadius: radii.tile, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
        {width > 0 && d ? (
          <Canvas style={{ width, height }}>
            <Path path={gridPath(width, height)} color={colors.border} style="stroke" strokeWidth={1} />
            <Path path={d} color={colors[tone]} style="stroke" strokeWidth={2} strokeJoin="round" strokeCap="round" />
          </Canvas>
        ) : null}
      </View>
      {/* The chart's image label already says the summary, so the visible copy is not read a second time. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID ? `${testID}-summary` : undefined}>
        {summaryContent ?? (
          <AppText variant="caption" color="textSecondary">
            {summary}
          </AppText>
        )}
      </View>
    </View>
  );
}
