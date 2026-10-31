# ADR 0005: Draw charts with Skia; keep chart maths in plain functions

**Status:** accepted (Phase 4). Must be confirmed on a physical phone (see Consequences).

**Context.** Spec §13.1 needs candlestick, line, and volume charts with pinch-zoom, pan, a long-press crosshair, drawing tools, and indicators. The charts must be phone-first and must work offline. The options considered:

- **A WebView charting library** (for example, a canvas library inside `react-native-webview`). This means a bridge for every gesture and every data update, a second JavaScript runtime, and harder accessibility.
- **`react-native-svg`**. This works, but redrawing hundreds of candles on every pan frame creates many native views.
- **`@shopify/react-native-skia`**. This is a GPU canvas with Expo SDK support (installed with `npx expo install`). It needs `react-native-reanimated` and `react-native-worklets` as peer dependencies, so it needs a development build rather than Expo Go.

**Decision.** Use Skia, and draw each layer as a single SVG path string:

- All geometry is in plain functions with no React or Skia:
  - `domain/market/chartGeometry.ts` handles viewport, zoom, pan, price↔pixel mapping, and Fibonacci levels.
  - `features/practice/chartModel.ts` builds the candle, line, bar, drawing, and level paths and the indicator panes.
  - `features/practice/drawingTools.ts` turns taps into drawings.
- `components/chart/PriceChart.tsx` only measures its size, handles gestures (`PanResponder`: one finger pans, two fingers zoom, a long press shows the crosshair, a tap is passed to the drawing tool), and hands the path strings to `<Path>`.
- `ChartControls` repeats zoom and pan as large buttons, for screen readers and for anyone who finds gestures hard.

**Consequences.**

- Chart maths is covered by unit tests with hand-checked pixel values. In Jest, Skia is replaced by a View that keeps the path string (`testing/jestSetupUi.tsx`).
- `react-native-gesture-handler` was not added. `PanResponder` is enough for these gestures, and it keeps the dependency count down. (ADR 0009 tried moving the chart to RNGH; it measured slower on the test phone and was not adopted. RNGH stays installed, but the chart does not use it.)
- **Not yet proven on hardware.** Spec §37.2 asks for a chart proof of concept on a physical phone. This has to be checked on the Android test device: smooth panning with 300 candles plus indicators, pinch-zoom, long press, and dark mode. If panning is janky, the next step is to move the viewport into a Reanimated shared value. The path builders stay as they are.
