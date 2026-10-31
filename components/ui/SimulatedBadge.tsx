import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from './AppText';
import { BADGE_MARKER, marker } from './simulated';

export type SimulatedKind = 'simulated' | 'paper' | 'replay' | 'demo' | 'backtest';

const TEXT: Record<SimulatedKind, string> = {
  simulated: 'Simulated',
  paper: 'Paper',
  replay: 'Replay',
  demo: 'Demo (MT)',
  backtest: 'Backtest · Simulated',
};

/** What a screen reader says for each kind. */
export const SPOKEN_KIND: Readonly<Record<SimulatedKind, string>> = {
  simulated: 'Simulated money, not real',
  paper: 'Paper trading, simulated money',
  replay: 'Replay, simulated money',
  demo: 'MetaTrader demo account, not real money',
  backtest: 'Backtest, simulated results',
};

interface SimulatedBadgeProps {
  readonly kind?: SimulatedKind;
  /** Extra visible text after the kind, e.g. a replay date: "Replay · 3 Mar 2024". */
  readonly detail?: string;
  readonly testID?: string;
}

/** A visible text pill: simulated money must never look real (brief §1). Always text, never colour alone. */
export function SimulatedBadge({ kind = 'simulated', detail, testID }: SimulatedBadgeProps) {
  const { colors, radii, spacing } = useTheme();
  const text = detail ? `${TEXT[kind]} · ${detail}` : TEXT[kind];
  return (
    <View
      {...marker(BADGE_MARKER)}
      testID={testID}
      accessible
      accessibilityLabel={detail ? `${SPOKEN_KIND[kind]}, ${detail}` : SPOKEN_KIND[kind]}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colors.simulatedBadgeBg,
        borderRadius: radii.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <AppText variant="caption" color="simulatedBadge" style={{ fontWeight: '600' }}>
        {text}
      </AppText>
    </View>
  );
}
