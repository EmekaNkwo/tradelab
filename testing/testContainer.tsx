/** Test-only React providers around the real-container harness in `harness.ts`. */
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ContainerProvider, type Container } from '../features/app';
import { ThemeProvider } from '../theme';

export { createTestHarness, movableClock, TEST_NOW, type TestHarness } from './harness';

export function TestProviders({ container, children }: { readonly container: Container; readonly children: ReactNode }) {
  return (
    <GestureHandlerRootView>
      <ContainerProvider container={container}>
        <ThemeProvider preference="light">{children}</ThemeProvider>
      </ContainerProvider>
    </GestureHandlerRootView>
  );
}
