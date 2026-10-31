import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../../components/navigation/navigatorStyles';
import { gatedScreenLayout } from '../../../components/navigation/RouteGate';
import { useTheme } from '../../../theme';

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
