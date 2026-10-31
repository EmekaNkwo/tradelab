import { Tabs } from 'expo-router';
import { TABS } from '../../components/navigation/menus';
import { TabIcon, tabScreenOptions } from '../../components/navigation/navigatorStyles';
import { isRouteEnabled } from '../../shared/routeAccess';
import { useTheme } from '../../theme';

export const unstable_settings = { initialRouteName: 'home' };

/** Bottom tabs (spec §4). A tab shows only when its feature is on (spec §37.1). */
export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs screenOptions={tabScreenOptions(theme)}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            // A switched-off tab is hidden; its screens still show "not available" if opened by a deep link.
            href: isRouteEnabled('/' + tab.name) ? undefined : null,
            title: tab.title,
            tabBarButtonTestID: `tab-${tab.name}`,
            tabBarIcon: ({ color, focused }) => <TabIcon icon={tab.icon} focused={focused} color={String(color)} theme={theme} />,
          }}
        />
      ))}
    </Tabs>
  );
}
