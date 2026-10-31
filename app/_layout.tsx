import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorState, LoadingState } from '../components/ui';
import { bootstrap } from '../di/bootstrap';
import { ContainerProvider, type Container } from '../features/app';
import { useSettings } from '../features/settings';
import type { AppError } from '../shared/errors';
import { ThemeProvider, useTheme } from '../theme';
import { stackScreenOptions } from '../components/navigation/navigatorStyles';
import { gatedScreenLayout } from '../components/navigation/RouteGate';
import { TaskNotificationTaps } from '../components/navigation/TaskNotificationTaps';

/** Every root screen is gated by its feature flag (shared/routeAccess.ts), deep links included. */
const rootScreenLayout = gatedScreenLayout('');

type BootState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'ready'; readonly container: Container };

export default function RootLayout() {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });

  const mounted = useRef(true);
  const load = useCallback(() => {
    bootstrap().then((result) => {
      if (!mounted.current) return;
      setBoot(result.ok ? { status: 'ready', container: result.value } : { status: 'error', error: result.error });
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const retry = () => {
    setBoot({ status: 'loading' });
    load();
  };

  return (
    // Gesture handler's root. Installed and kept (ADR 0009), but the price chart uses PanResponder and does not need it.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {boot.status === 'ready' ? (
          <ContainerProvider container={boot.container}>
            <ThemedApp />
          </ContainerProvider>
        ) : (
          <ThemeProvider preference="system">
            <Centered>
              {boot.status === 'loading' ? <LoadingState label="Opening TradeLab…" /> : <ErrorState error={boot.error} onRetry={retry} />}
            </Centered>
          </ThemeProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  const settings = useSettings();
  const preference = settings.status === 'success' ? settings.data.theme : 'system';
  return (
    <ThemeProvider preference={preference}>
      <AppStack />
    </ThemeProvider>
  );
}

function AppStack() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <TaskNotificationTaps />
      <Stack
        screenLayout={rootScreenLayout}
        screenOptions={stackScreenOptions(theme)}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: 'Welcome to TradeLab', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="class/[id]" options={{ title: 'Class' }} />
        <Stack.Screen name="review" options={{ title: 'Review' }} />
        <Stack.Screen name="lesson/[id]" options={{ title: 'Lesson' }} />
        <Stack.Screen name="glossary/[id]" options={{ title: 'Glossary' }} />
        <Stack.Screen name="mt-task/[id]" options={{ title: 'MetaTrader task' }} />
        <Stack.Screen name="labs/index" options={{ title: 'Analysis labs' }} />
        <Stack.Screen name="labs/concepts/[lab]" options={{ title: 'Lab' }} />
        <Stack.Screen name="labs/concept/[id]" options={{ title: 'Concept' }} />
        <Stack.Screen name="labs/companies" options={{ title: 'Company analysis' }} />
        <Stack.Screen name="labs/company/[id]" options={{ title: 'Company' }} />
        <Stack.Screen name="labs/red-flags" options={{ title: 'Red Flag Detector' }} />
        <Stack.Screen name="labs/red-flag/[id]" options={{ title: 'Red Flag Detector' }} />
        <Stack.Screen name="labs/scenarios" options={{ title: 'What could happen?' }} />
        <Stack.Screen name="labs/scenario/[id]" options={{ title: 'What could happen?' }} />
        <Stack.Screen name="labs/markets" options={{ title: 'Market comparison' }} />
        <Stack.Screen name="strategy/[id]" options={{ title: 'Strategy' }} />
        <Stack.Screen name="traders" options={{ title: 'Famous traders' }} />
        <Stack.Screen name="trader/[id]" options={{ title: 'Trader' }} />
        <Stack.Screen name="research/index" options={{ title: 'Research Library' }} />
        <Stack.Screen name="backtest/index" options={{ title: 'Backtesting Lab' }} />
        <Stack.Screen name="backtest/builder" options={{ title: 'Strategy Builder' }} />
        <Stack.Screen name="backtest/strategy/[id]" options={{ title: 'Your strategy' }} />
        <Stack.Screen name="backtest/run" options={{ title: 'Run a backtest' }} />
        <Stack.Screen name="backtest/result/[id]" options={{ title: 'Backtest report' }} />
        <Stack.Screen name="backtest/compare" options={{ title: 'Comparison Studio' }} />
        <Stack.Screen name="backtest/playbook/[id]" options={{ title: 'Playbook' }} />
        <Stack.Screen name="portfolio/index" options={{ title: 'Portfolio' }} />
        <Stack.Screen name="portfolio/sandbox" options={{ title: 'Investing sandbox' }} />
        <Stack.Screen name="progress/index" options={{ title: 'Progress' }} />
        <Stack.Screen name="progress/skill/[id]" options={{ title: 'Skill' }} />
        <Stack.Screen name="progress/challenges" options={{ title: 'Challenges' }} />
        <Stack.Screen name="progress/challenge/[id]" options={{ title: 'Challenge' }} />
        <Stack.Screen name="data/index" options={{ title: 'Your price data' }} />
        <Stack.Screen name="data/import" options={{ title: 'Import price data' }} />
        <Stack.Screen name="data/[id]" options={{ title: 'Price data' }} />
        <Stack.Screen name="calendar/index" options={{ title: 'Market calendar' }} />
        <Stack.Screen name="calendar/[id]" options={{ title: 'Calendar event' }} />
        <Stack.Screen name="news" options={{ title: 'News to Learning' }} />
        <Stack.Screen name="coach" options={{ title: 'Coach' }} />
      </Stack>
    </>
  );
}

function Centered({ children }: { readonly children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>{children}</View>;
}

/** Route-level error boundary: an unexpected render error never leaves a blank screen. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemeProvider preference="system">
      <Centered>
        <ErrorState error={{ kind: 'StorageError', message: error.message, cause: error }} onRetry={retry} />
      </Centered>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
