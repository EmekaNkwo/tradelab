import { useContext, type ReactNode, type Ref } from 'react';
import { ScrollView, StyleSheet, type ScrollViewInstance } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

interface ScreenProps {
  readonly children: ReactNode;
  readonly testID?: string;
  /** The underlying ScrollView, e.g. to scroll back to the top when the content is replaced. */
  readonly ref?: Ref<ScrollViewInstance>;
  /** The screen has no navigator header (Home): pad below the status bar / notch. */
  readonly topInset?: boolean;
}

/** Scrollable screen container with theme background and consistent padding. */
export function Screen({ children, testID, ref, topInset = false }: ScreenProps) {
  const { colors, spacing } = useTheme();
  // Read the context directly: outside a SafeAreaProvider (tests, previews) there is no inset, not a crash.
  const insets = useContext(SafeAreaInsetsContext);
  const top = topInset ? (insets?.top ?? 0) : 0;
  return (
    <ScrollView
      ref={ref}
      testID={testID}
      style={[styles.fill, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ padding: spacing.screen, paddingTop: spacing.screen + top, gap: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
