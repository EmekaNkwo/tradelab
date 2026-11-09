import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../../components/navigation/navigatorStyles';
import { gatedScreenLayout } from '../../../components/navigation/RouteGate';
import { useTheme } from '../../../theme';

/** A link into this tab from elsewhere keeps the tab's first screen underneath, so Back and the tab button lead home. */
export const unstable_settings = { initialRouteName: 'index' };

/** Every screen in this tab is gated by its feature flag (shared/routeAccess.ts). */
const screenLayout = gatedScreenLayout('/strategies');

export default function StrategiesLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenLayout={screenLayout}
      screenOptions={stackScreenOptions(theme)}
    >
      <Stack.Screen name="index" options={{ title: 'Strategies' }} />
    </Stack>
  );
}
