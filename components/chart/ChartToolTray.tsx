import { Pressable, View } from 'react-native';
import type { DrawingTool } from '../../features/practice';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { cardSurface } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Check, Eraser, MoveHorizontal, Percent, RectangleHorizontal, TrendingUp, Undo2, type LucideIcon } from '../ui/icons';
import { pressScale } from '../ui/pressFeedback';
import { useReduceMotion } from '../ui/useReduceMotion';

export const TOOL_BUTTON_SIZE = 48;

const TOOL_ICONS: Readonly<Record<DrawingTool, LucideIcon>> = {
  hline: MoveHorizontal,
  trend: TrendingUp,
  zone: RectangleHorizontal,
  fib: Percent,
};

interface ToolOption {
  readonly id: DrawingTool;
  readonly label: string;
}

interface ChartToolTrayProps {
  readonly tools: readonly ToolOption[];
  readonly selected: DrawingTool | null;
  /** Called with the tapped tool; the lab decides what tapping the selected one does (it puts it down). */
  readonly onSelect: (tool: DrawingTool) => void;
  readonly onUndo: () => void;
  readonly onClear: () => void;
  readonly canUndo: boolean;
  readonly canClear: boolean;
  /** The tool hint, under the buttons. */
  readonly hint: string;
  readonly drawingCount: number;
}

interface CircleButtonProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly role: 'radio' | 'button';
  /** A radio names its group in its hint, as SegmentedControl does, for TalkBack. */
  readonly group?: string;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

/** A circular tool button with its caption below; the selected tool is filled with brand, ringed, and ticked. */
function CircleButton({ icon, label, onPress, role, group, selected = false, disabled = false, testID }: CircleButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  const fg = selected ? colors.onBrand : disabled ? colors.textSecondary : colors.brand;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={group}
      accessibilityState={role === 'radio' ? { selected, disabled } : { disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', gap: spacing.xs, minWidth: touchTarget, minHeight: touchTarget, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressScale(pressed, reduceMotion) }] })}
    >
      <View
        style={{
          width: TOOL_BUTTON_SIZE,
          height: TOOL_BUTTON_SIZE,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? colors.brand : colors.surfaceMuted,
          // A ring as well as the fill, so the chosen tool is not shown by colour alone.
          borderWidth: 2,
          borderColor: selected ? colors.textPrimary : 'transparent',
        }}
      >
        <Icon icon={icon} size={22} literalColor={fg} strokeWidth={selected ? 2.25 : undefined} />
        {selected ? (
          <View
            testID={testID ? `${testID}-selected` : undefined}
            style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon icon={Check} size={12} literalColor={colors.brand} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <AppText variant="caption" color="textPrimary" numberOfLines={2} style={{ textAlign: 'center', maxWidth: 72 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Chart Lab's tool tray (restyle brief §5.4): a rounded sheet of circular tool buttons, Undo and Clear. Chrome
 * around PriceChart; tool semantics stay in the lab (pick a tool, then tap the chart).
 */
export function ChartToolTray({ tools, selected, onSelect, onUndo, onClear, canUndo, canClear, hint, drawingCount }: ChartToolTrayProps) {
  const theme = useTheme();
  const { spacing, radii } = theme;
  return (
    <View testID="chart-tool-tray" style={[cardSurface(theme), { borderRadius: radii.hero, padding: spacing.lg, gap: spacing.md }]}>
      <AppText variant="label">Drawing tool</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Drawing tool" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {tools.map((t) => (
            <CircleButton key={t.id} testID={`tool-${t.id}`} icon={TOOL_ICONS[t.id]} label={t.label} role="radio" group="Drawing tool" selected={selected === t.id} onPress={() => onSelect(t.id)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <CircleButton icon={Undo2} label="Undo" role="button" onPress={onUndo} disabled={!canUndo} />
          <CircleButton icon={Eraser} label="Clear drawings" role="button" onPress={onClear} disabled={!canClear} />
        </View>
      </View>
      <AppText color="textSecondary" testID="drawing-hint">
        {hint}
      </AppText>
      <AppText variant="caption" color="textSecondary" tabular accessibilityLiveRegion="polite">{`${drawingCount} drawings`}</AppText>
    </View>
  );
}
