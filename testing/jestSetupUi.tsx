/**
 * UI tests render whole screens on a real SQLite container, and a few take
 * several seconds on a loaded machine, so the UI project gets 15 s per test
 * instead of Jest's 5 s (the known slow tests set their own, longer timeout).
 * Set here rather than as `testTimeout` in jest.config.js: Jest 30's circus
 * runner reads only the global `testTimeout`
 * (node_modules/jest-circus/build/jestAdapterInit.js, `initialize`), so a
 * per-project value there is ignored.
 */
jest.setTimeout(15_000);

// Icon fonts load through the native asset registry, which does not exist in Jest.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>;
  return { __esModule: true, default: Object.assign(Icon, { glyphMap: {} }) };
});

// Reanimated runs on the UI thread natively. Only the shared-value hooks the chart uses are needed in
// Jest: a shared value is a plain box, and a derived value recomputes whenever it is read.
// `NativeEventsManager` is there only because react-native-gesture-handler (installed, and wrapped
// around the app and the test providers, but not used by the chart) picks its detector from it when
// imported. Anything else from Reanimated is undefined here: add it when a component starts using it.
jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual<typeof import('react')>('react');
  const useSharedValue = <T,>(initial: T) => useRef({ value: initial }).current;
  const useDerivedValue = <T,>(compute: () => T) =>
    useRef({
      get value() {
        return compute();
      },
    }).current;
  class NativeEventsManager {
    attachEvents() {}
    detachEvents() {}
    updateEvents() {}
  }
  return { __esModule: true, useSharedValue, useDerivedValue, NativeEventsManager };
});

// Skia draws natively; in Jest each canvas element becomes a plain View that keeps its SVG path for assertions.
jest.mock('@shopify/react-native-skia', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Canvas = ({ children, style }: { children?: React.ReactNode; style?: object }) => (
    <View testID="skia-canvas" style={style}>
      {children}
    </View>
  );
  const Path = ({ path }: { path: string }) => <View testID="skia-path" accessibilityHint={path} />;
  // Animated props are Reanimated shared values; the mock keeps their current value for assertions.
  type MockAnimated<T> = T | { value: T };
  const current = <T,>(v: MockAnimated<T>): T => (typeof v === 'object' && v !== null && 'value' in v ? v.value : v);
  // `lineRenders` counts React renders of Line, so tests can prove an animated prop moved without one.
  // `lastProps` keeps the animated props, so tests can read their current values after a gesture.
  const lineRenders: { count: number; lastProps: { p1: MockAnimated<{ x: number }>; opacity: MockAnimated<number> } | null } = { count: 0, lastProps: null };
  const Line = ({ p1, opacity }: { p1: MockAnimated<{ x: number }>; opacity: MockAnimated<number> }) => {
    lineRenders.count += 1;
    lineRenders.lastProps = { p1, opacity };
    return <View testID="skia-line" accessibilityHint={current(opacity) > 0 ? `x=${current(p1).x}` : 'hidden'} />;
  };
  const vec = (x = 0, y?: number) => ({ x, y: y ?? x });
  return { __esModule: true, Canvas, Path, Line, vec, lineRenders };
});
