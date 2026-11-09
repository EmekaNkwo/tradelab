import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../../components/navigation/navigatorStyles';
import { gatedScreenLayout } from '../../../components/navigation/RouteGate';
import { useTheme } from '../../../theme';

/** A link into this tab from elsewhere keeps the tab's first screen underneath, so Back and the tab button lead home. */
export const unstable_settings = { initialRouteName: 'index' };

/** Every screen in this tab is gated by its feature flag (shared/routeAccess.ts). */
const screenLayout = gatedScreenLayout('/learn');

export default function LearnLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenLayout={screenLayout}
      screenOptions={stackScreenOptions(theme)}
    >
      <Stack.Screen name="index" options={{ title: 'Learn' }} />
      <Stack.Screen name="glossary" options={{ title: 'Glossary' }} />
      <Stack.Screen name="calculators" options={{ title: 'Calculators' }} />
      <Stack.Screen name="metatrader" options={{ title: 'MetaTrader practice' }} />
      <Stack.Screen name="programs" options={{ title: 'Programs' }} />
    </Stack>
  );
}
