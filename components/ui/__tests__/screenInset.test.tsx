import { render, screen } from '@testing-library/react-native';
import { StatusBar, StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme';
import { Screen } from '../Screen';

// Larger than the test environment's Android status bar (42), so the context's inset is the one used.
const INSETS = { top: 64, bottom: 0, left: 0, right: 0 };

describe('Screen top inset', () => {
  it('starts the scroll area below the status bar, so scrolled content never runs under it', async () => {
    await render(
      <SafeAreaInsetsContext.Provider value={INSETS}>
        <ThemeProvider preference="dark">
          <Screen testID="s" topInset>
            <Text>Body</Text>
          </Screen>
        </ThemeProvider>
      </SafeAreaInsetsContext.Provider>,
    );
    expect(StatusBar.currentHeight ?? 0).toBeLessThan(INSETS.top);
    const scroll = screen.getByTestId('s');
    // The inset is on the frame around the ScrollView, not inside its scrolling content.
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingTop).toBeUndefined();
    const frame = scroll.parent?.parent ?? scroll.parent;
    const frames = [scroll.parent, frame].map((n) => StyleSheet.flatten(n?.props.style ?? {}));
    expect(frames.some((f) => f.paddingTop === 64)).toBe(true);
    // A solid band covers the status bar area above the scroll area.
    const band = StyleSheet.flatten(screen.getByTestId('status-bar-band', { includeHiddenElements: true }).props.style);
    expect(band).toMatchObject({ position: 'absolute', top: 0, height: 64 });
    expect(band.backgroundColor).toBeTruthy();
    // Clipped scroll area, and the band above elevated cards.
    expect(StyleSheet.flatten(scroll.props.style).overflow).toBe('hidden');
    expect(band.elevation).toBeGreaterThanOrEqual(24);
  });

  it('on Android, uses the status bar height when the safe-area inset reports 0', async () => {
    const { Platform, StatusBar } = jest.requireActual<typeof import('react-native')>('react-native');
    const os = Platform.OS;
    const height = StatusBar.currentHeight;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    Object.defineProperty(StatusBar, 'currentHeight', { value: 28, configurable: true });
    try {
      await render(
        <SafeAreaInsetsContext.Provider value={{ ...INSETS, top: 0 }}>
          <ThemeProvider preference="dark">
            <Screen testID="s" topInset>
              <Text>Body</Text>
            </Screen>
          </ThemeProvider>
        </SafeAreaInsetsContext.Provider>,
      );
      expect(StyleSheet.flatten(screen.getByTestId('status-bar-band', { includeHiddenElements: true }).props.style).height).toBe(28);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      Object.defineProperty(StatusBar, 'currentHeight', { value: height, configurable: true });
    }
  });

  it('adds no frame when the screen has a navigator header', async () => {
    await render(
      <ThemeProvider preference="light">
        <Screen testID="s">
          <Text>Body</Text>
        </Screen>
      </ThemeProvider>,
    );
    expect(StyleSheet.flatten(screen.getByTestId('s').props.contentContainerStyle).paddingTop).toBeUndefined();
  });
});
