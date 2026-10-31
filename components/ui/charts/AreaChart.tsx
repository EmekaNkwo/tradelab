import { useId, useState } from 'react';
import { View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../../../theme';
import { AppText } from '../AppText';
import { areaPath, chartSummary, clampSelection, finitePoints, indexAtX, selectedText, smoothPath, stepIndex, toPoints, type ChartPoint } from './chartMath';
import { ValuePill } from './ValuePill';

interface AreaChartProps {
  /** What the chart shows, e.g. "Plan-follow rate by week". Starts the spoken summary. */
  readonly title: string;
  readonly points: readonly ChartPoint[];
  readonly format: (value: number) => string;
  readonly height?: number;
  /** Starts on the last point. */
  readonly initialIndex?: number;
  readonly onSelect?: (index: number) => void;
  /** `brand` for learning stats; `neutral` (textPrimary line) for equity curves, so money never looks like brand. */
  readonly tone?: 'brand' | 'neutral';
  readonly testID?: string;
}

const PILL_SPACE = 36;
const BOTTOM = 8;

/**
 * Smooth line with a soft brand gradient under it, a dotted grid, and a value pill over the selected point with a
 * vertical guide. Tap or drag to select; screen readers swipe up/down to move the selection and hear a summary.
 */
export function AreaChart({ title, points: rawPoints, format, height = 180, initialIndex, onSelect, tone = 'brand', testID }: AreaChartProps) {
  const { colors, spacing } = useTheme();
  const gradientId = `area-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [width, setWidth] = useState(0);
  const points = finitePoints(rawPoints);
  // Only the learner's choice is state; the shown selection is derived, so new data never leaves it out of range.
  const [chosen, setChosen] = useState<number | null>(null);
  const selected = clampSelection(chosen, initialIndex, points.length);
  const lineColor = tone === 'neutral' ? colors.textPrimary : colors.brand;
  const xy = toPoints(
    points.map((p) => p.value),
    { width, height, top: PILL_SPACE, bottom: BOTTOM },
  );
  const at = selected === null ? undefined : xy[selected];

  const select = (i: number) => {
    setChosen(i);
    onSelect?.(i);
  };
  const onTouch = (e: GestureResponderEvent) => select(indexAtX(e.nativeEvent.locationX, width, points.length));
  const onAction = (e: AccessibilityActionEvent) => {
    if (selected === null) return;
    select(stepIndex(selected, e.nativeEvent.actionName === 'increment' ? 1 : -1, points.length));
  };
  const gridYs = [0.25, 0.5, 0.75].map((f) => PILL_SPACE + f * (height - PILL_SPACE - BOTTOM));
  const spoken = selectedText(points, selected, format);

  return (
    <View testID={testID} style={{ gap: spacing.xs }}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={chartSummary(title, points, format)}
        accessibilityValue={spoken ? { text: `Selected: ${spoken}` } : undefined}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        style={{ height }}
      >
        {width > 0 && points.length > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={lineColor} stopOpacity={0.24} />
                <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {gridYs.map((y) => (
              <Line key={y} x1={0} x2={width} y1={y} y2={y} stroke={colors.border} strokeWidth={1} strokeDasharray="2 4" />
            ))}
            <Path d={areaPath(xy, height)} fill={`url(#${gradientId})`} />
            <Path d={smoothPath(xy)} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinecap="round" />
            {at ? (
              <>
                <Line x1={at.x} x2={at.x} y1={PILL_SPACE - 6} y2={height} stroke={colors.textSecondary} strokeWidth={1} strokeDasharray="3 3" />
                <Circle cx={at.x} cy={at.y} r={5} fill={colors.surface} stroke={lineColor} strokeWidth={2.5} />
              </>
            ) : null}
          </Svg>
        ) : null}
        {at && spoken && selected !== null ? <ValuePill testID={testID ? `${testID}-pill` : undefined} text={format(points[selected]!.value)} x={at.x} top={0} chartWidth={width} /> : null}
      </View>
      {points.length > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppText variant="caption" color="textSecondary">
            {points[0]!.label}
          </AppText>
          {selected !== null ? (
            <AppText variant="caption" color="textPrimary">
              {points[selected]!.label}
            </AppText>
          ) : null}
          <AppText variant="caption" color="textSecondary">
            {points[points.length - 1]!.label}
          </AppText>
        </View>
      ) : (
        <AppText color="textSecondary">No data yet.</AppText>
      )}
    </View>
  );
}
