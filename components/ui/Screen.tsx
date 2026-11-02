import { useContext, type ReactNode, type Ref } from 'react';
import { Platform, ScrollView, StatusBar, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaInsetsContext, initialWindowMetrics } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

interface ScreenProps {
  readonly children: ReactNode;
  readonly testID?: string;
  /** The underlying ScrollView, e.g. to scroll back to the top when the content is replaced. */
  readonly ref?: Ref<ScrollViewInstance>;
  /**
   * The screen has no navigator header (Home): the scroll area starts below the status bar / notch, on a solid band
   * of the background, so scrolled content never runs under the clock and icons.
   */
  readonly topInset?: boolean;
}

/** Scrollable screen container with theme background and consistent padding. */
export function Screen({ children, testID, ref, topInset = false }: ScreenProps) {
  const { colors, spacing } = useTheme();
  // Read the context directly: outside a SafeAreaProvider (tests, previews) there is no inset, not a crash. On a
  // MIUI phone both the context and the initial metrics reported 0 while the app drew behind the status bar, so on
  // Android the status bar's own height is the floor.
  const insets = useContext(SafeAreaInsetsContext);
  const top = topInset ? Math.max(insets?.top ?? 0, initialWindowMetrics?.insets.top ?? 0, androidStatusBarHeight()) : 0;
  const scroll = (
    <ScrollView
      ref={ref}
      testID={testID}
      style={[topInset ? styles.clipped : styles.fill, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ padding: spacing.screen, gap: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
  if (!topInset) return scroll;
  // Android can draw scrolled content outside the ScrollView's frame, so the scroll area itself clips (the frame's
  // bounds include the inset), and a solid band sits over the status bar area. The band is elevated above the cards,
  // whose shadows use elevation and would otherwise draw over it (measured on device).
  return (
    <View style={[styles.frame, { backgroundColor: colors.bg, paddingTop: top }]}>
      {scroll}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden testID="status-bar-band" style={[styles.band, { height: top, backgroundColor: colors.bg }]} />
    </View>
  );
}

/** Above any card or sheet elevation in the theme, so nothing scrolled draws over the status bar band. */
const STATUS_BAND_ELEVATION = 24;

function androidStatusBarHeight(): number {
  return Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  frame: { flex: 1 },
  clipped: { flex: 1, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, elevation: STATUS_BAND_ELEVATION, shadowColor: 'transparent' },
});
