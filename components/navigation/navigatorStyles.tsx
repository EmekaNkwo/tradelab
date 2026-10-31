import { View, type TextStyle } from 'react-native';
import type { Theme } from '../../theme';
import { Icon } from '../ui/Icon';
import type { LucideIcon } from '../ui/icons';

/**
 * Navigator chrome (restyle brief §4): one look for every stack header and for the bottom tab bar, so a screen
 * never styles its own header. Pure functions of the theme; the layouts in app/ pass the result as options.
 */

/** The heavier stroke that marks the active tab (the house stroke is 1.75). */
export const ACTIVE_TAB_STROKE = 2.5;
export const TAB_ICON_SIZE = 22;

/** Header title on the type scale: heading 17 semibold, in the bundled font when the build has it. */
function headerTitleStyle(theme: Theme): Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontWeight'> & { color: string } {
  const { fontSize, fontWeight } = theme.typography.heading;
  return { fontSize, fontWeight, color: theme.colors.textPrimary, ...(theme.fontFamily ? { fontFamily: theme.fontFamily } : null) };
}

/**
 * Every stack: surface header with no hard shadow line, the platform back arrow in brand without the previous
 * screen's title next to it (a bare arrow; its spoken label stays "Back"), and the app background behind content.
 */
export function stackScreenOptions(theme: Theme) {
  const { colors } = theme;
  return {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.brand,
    headerTitleStyle: headerTitleStyle(theme),
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: colors.bg },
  };
}

/** Bottom tab bar: surface bar, top hairline, labels in caption weight, brand when active (safe-area aware by default). */
export function tabScreenOptions(theme: Theme) {
  const { colors } = theme;
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, elevation: 0, shadowOpacity: 0 },
    tabBarLabelStyle: { fontSize: 12, fontWeight: '600' as const, ...(theme.fontFamily ? { fontFamily: theme.fontFamily } : null) },
  };
}

interface TabIconProps {
  readonly icon: LucideIcon;
  readonly focused: boolean;
  readonly color: string;
  readonly theme: Theme;
}

/** Outline icon; the active tab sits on a brand-tint pill with a heavier stroke, so it is not shown by colour alone. */
export function TabIcon({ icon, focused, color, theme }: TabIconProps) {
  const { colors, radii } = theme;
  return (
    <View
      testID={focused ? 'tab-icon-active' : undefined}
      style={{
        width: 48,
        height: 28,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.brandTint : 'transparent',
      }}
    >
      <Icon icon={icon} size={TAB_ICON_SIZE} literalColor={color} strokeWidth={focused ? ACTIVE_TAB_STROKE : undefined} />
    </View>
  );
}
