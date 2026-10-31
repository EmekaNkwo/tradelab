import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';
import { FlaskConical } from '../ui/icons';

/** Every chart in Practice is generated, never real prices (spec §13.3, §30). A quiet muted strip, not a warning. */
export function SimulatedNotice() {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.surfaceMuted, borderRadius: radii.tile, padding: spacing.md }}>
      <Icon icon={FlaskConical} size={18} color="textSecondary" />
      <AppText variant="caption" color="textSecondary" testID="simulated-label" style={{ flex: 1 }}>
        Simulated scenario: generated prices, not real market data. It does not reproduce every real market mechanic (spreads, commissions, and swaps are left out).
      </AppText>
    </View>
  );
}
