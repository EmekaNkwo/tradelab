import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../../components/navigation/navigatorStyles';
import { gatedScreenLayout } from '../../../components/navigation/RouteGate';
import { useTheme } from '../../../theme';

/** A link into this tab from elsewhere keeps the tab's first screen underneath, so Back and the tab button lead home. */
export const unstable_settings = { initialRouteName: 'index' };

/** Every screen in this tab is gated by its feature flag (shared/routeAccess.ts). */
const screenLayout = gatedScreenLayout('/more');

export default function MoreLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenLayout={screenLayout}
      screenOptions={stackScreenOptions(theme)}
    >
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="preferences" options={{ title: 'What I want to learn' }} />
      <Stack.Screen name="risk-rules" options={{ title: 'Risk rules' }} />
      <Stack.Screen name="plan/index" options={{ title: 'Trading plan' }} />
      <Stack.Screen name="plan/edit" options={{ title: 'Edit trading plan' }} />
      <Stack.Screen name="checklist" options={{ title: 'Pre-trade checklist' }} />
      <Stack.Screen name="sessions" options={{ title: 'Market sessions' }} />
      <Stack.Screen name="broker-check" options={{ title: 'Broker check' }} />
      <Stack.Screen name="progress-review" options={{ title: 'Practice Progress Review' }} />
      <Stack.Screen name="backup" options={{ title: 'Backup and restore' }} />
      <Stack.Screen name="about" options={{ title: 'About and risk' }} />
      <Stack.Screen name="services" options={{ title: 'Data and AI services' }} />
    </Stack>
  );
}
