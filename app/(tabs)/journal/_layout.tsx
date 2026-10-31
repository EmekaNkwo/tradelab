import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../../components/navigation/navigatorStyles';
import { gatedScreenLayout } from '../../../components/navigation/RouteGate';
import { useTheme } from '../../../theme';

/** Every screen in this tab is gated by its feature flag (shared/routeAccess.ts). */
const screenLayout = gatedScreenLayout('/journal');

export default function JournalLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenLayout={screenLayout}
      screenOptions={stackScreenOptions(theme)}
    >
      <Stack.Screen name="index" options={{ title: 'Journal' }} />
      <Stack.Screen name="entry/[id]" options={{ title: 'Journal entry' }} />
      <Stack.Screen name="new" options={{ title: 'Add a demo trade' }} />
      <Stack.Screen name="import" options={{ title: 'Import MT statement' }} />
      <Stack.Screen name="stats" options={{ title: 'Weekly and monthly review' }} />
      <Stack.Screen name="psychology" options={{ title: 'Psychology Lab' }} />
    </Stack>
  );
}
