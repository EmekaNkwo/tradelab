import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { BrandMark } from './BrandMark';

/**
 * Shown while the app opens its database and content. Same mark, size and background as the native splash, so the
 * hand-over is invisible; the name and a quiet status line appear underneath. No spinner and no motion.
 */
export function BootScreen({ label = 'Opening TradeLab…' }: { readonly label?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.bg, gap: spacing.lg }]} accessible accessibilityRole="progressbar" accessibilityLiveRegion="polite" accessibilityLabel={label} testID="boot-screen">
      <BrandMark size={128} />
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <AppText variant="title" accessible={false}>
          TradeLab
        </AppText>
        <AppText color="textSecondary" accessible={false}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
