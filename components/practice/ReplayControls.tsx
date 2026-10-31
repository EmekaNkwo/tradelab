import { Pressable, View } from 'react-native';
import { touchTarget, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { cardSurface } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Pause, Play, StepBack, StepForward, type LucideIcon } from '../ui/icons';
import { pressScale } from '../ui/pressFeedback';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useReduceMotion } from '../ui/useReduceMotion';

interface Speed {
  readonly ms: number;
  readonly label: string;
}

interface ReplayControlsProps {
  readonly playing: boolean;
  readonly speedMs: number;
  readonly speeds: readonly Speed[];
  readonly canStepBack: boolean;
  readonly finished: boolean;
  readonly busy: boolean;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onTogglePlay: () => void;
  readonly onSpeed: (ms: number) => void;
}

interface PillButtonProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly primary?: boolean;
}

function PillButton({ icon, label, onPress, disabled, primary = false }: PillButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  const fg = primary ? colors.onBrand : colors.brand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: spacing.xxs, minHeight: touchTarget, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressScale(pressed, reduceMotion) }] })}
    >
      <View style={{ width: 48, height: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.brand : colors.surfaceMuted }}>
        <Icon icon={icon} size={22} literalColor={fg} />
      </View>
      <AppText variant="caption" color="textPrimary" style={{ textAlign: 'center' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Replay's controls as one floating pill (restyle brief §5.4): Step back, Play/Pause and Next candle, with the
 * replay's own speeds under them. Only the controls the replay already has; nothing is added.
 */
export function ReplayControls({ playing, speedMs, speeds, canStepBack, finished, busy, onNext, onBack, onTogglePlay, onSpeed }: ReplayControlsProps) {
  const theme = useTheme();
  const { spacing, radii } = theme;
  return (
    <View testID="replay-controls" style={[cardSurface(theme), { borderRadius: radii.hero, padding: spacing.md, gap: spacing.md }]}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <PillButton icon={StepBack} label="Step back" onPress={onBack} disabled={!canStepBack || playing || busy} />
        <PillButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} onPress={onTogglePlay} disabled={finished || busy} />
        <PillButton icon={StepForward} label="Next candle" onPress={onNext} disabled={finished || playing || busy} primary />
      </View>
      <SegmentedControl label="Speed" options={speeds.map((s) => ({ value: String(s.ms), label: s.label }))} value={String(speedMs)} onChange={(v) => onSpeed(Number(v))} />
    </View>
  );
}
