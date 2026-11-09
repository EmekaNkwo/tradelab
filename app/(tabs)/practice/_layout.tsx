import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../../components/navigation/navigatorStyles';
import { gatedScreenLayout } from '../../../components/navigation/RouteGate';
import { useTheme } from '../../../theme';

/** A link into this tab from elsewhere keeps the tab's first screen underneath, so Back and the tab button lead home. */
export const unstable_settings = { initialRouteName: 'index' };

/** Every screen in this tab is gated by its feature flag (shared/routeAccess.ts). */
const screenLayout = gatedScreenLayout('/practice');

export default function PracticeLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenLayout={screenLayout}
      screenOptions={stackScreenOptions(theme)}
    >
      <Stack.Screen name="index" options={{ title: 'Practice' }} />
      <Stack.Screen name="chart-lab" options={{ title: 'Chart Lab' }} />
      <Stack.Screen name="replay" options={{ title: 'Replay' }} />
      <Stack.Screen name="drill" options={{ title: 'Drill' }} />
      <Stack.Screen name="paper/index" options={{ title: 'Paper trading' }} />
      <Stack.Screen name="paper/[id]" options={{ title: 'Paper account' }} />
    </Stack>
  );
}
