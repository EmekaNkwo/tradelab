import { Canvas, Line, Path, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import {
  barPaths,
  candlePaths,
  clampViewport,
  crosshairText,
  drawingShapes,
  indexAtX,
  latestViewport,
  levelPath,
  linePath,
  pan,
  paneRange,
  priceAtY,
  pricePrecision,
  priceRange,
  zoom,
  type ChartCandle,
  type ChartPoint,
  type ChartStyle,
  type Drawing,
  type LevelLine,
  type OverlayLine,
  type PaneModel,
  simulatedTime,
  realTime,
  type Viewport,
  yForPrice,
} from '../../features/practice';
import { useTheme } from '../../theme';
import { chartPalette } from './chartTheme';
import { AppText } from '../ui';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { describeChart } from './chartDescription';
import { ChartControls } from './ChartControls';
import { createHoverStore, type HoverStore } from './hoverStore';

interface PriceChartProps {
  readonly candles: readonly ChartCandle[];
  readonly style?: ChartStyle;
  readonly overlays?: readonly OverlayLine[];
  readonly pane?: PaneModel | null;
  readonly drawings?: readonly Drawing[];
  /** Entry, stop, and target lines. */
  readonly levels?: readonly LevelLine[];
  /** Called with the tapped candle and price (used by drawing tools). */
  readonly onTap?: (point: ChartPoint) => void;
  /** Keep the newest candle in view as candles are added (replay). */
  readonly followLatest?: boolean;
  readonly height?: number;
  readonly testID?: string;
  /** Real (imported or fetched) candles show their real times instead of a "Simulated" date. */
  readonly realData?: boolean;
}

const PANE_HEIGHT = 90;
// Stable defaults, so memoised paths are not rebuilt on every render.
const NO_OVERLAYS: readonly OverlayLine[] = [];
const NO_DRAWINGS: readonly Drawing[] = [];
const NO_LEVELS: readonly LevelLine[] = [];
const LONG_PRESS_MS = 350;
const TAP_SLOP = 8;

type Gesture =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly x: number; readonly y: number; readonly start: Viewport }
  | { readonly kind: 'pan'; readonly x: number; readonly start: Viewport }
  | { readonly kind: 'pinch'; readonly distance: number; readonly anchor: number; readonly start: Viewport }
  | { readonly kind: 'crosshair' };

/** Shown in the readout: the hovered candle's OHLC, or the last close. Re-renders on its own as the crosshair moves. */
const ChartReadout = memo(function ChartReadout({
  hover,
  candles,
  digits,
  realData,
}: {
  readonly hover: HoverStore;
  readonly candles: readonly ChartCandle[];
  readonly digits: number;
  readonly realData: boolean;
}) {
  const index = useSyncExternalStore(hover.subscribe, hover.get);
  const hovered = index === null ? null : (candles[index] ?? null);
  const last = candles[candles.length - 1];
  return (
    <AppText variant="caption" color="textSecondary" testID="chart-readout">
      {hovered
        ? crosshairText(hovered, digits, realData)
        : last
          ? `Last close ${last.close.toFixed(digits)} · ${realData ? realTime(last.time) : simulatedTime(last.time)}`
          : 'No candles'}
    </AppText>
  );
});

const touchDistance = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
};

/**
 * Candlestick or line chart drawn with Skia (ADR 0005). One finger pans,
 * two fingers zoom, a long press shows the crosshair with OHLC, and a tap is
 * passed to `onTap`. Buttons below do the same for screen-reader users.
 */
export function PriceChart({
  candles,
  style = 'hollow',
  overlays = NO_OVERLAYS,
  pane = null,
  drawings = NO_DRAWINGS,
  levels = NO_LEVELS,
  onTap,
  followLatest = false,
  height = 260,
  testID,
  realData = false,
}: PriceChartProps) {
  const theme = useTheme();
  const { spacing } = theme;
  const colors = useMemo(() => chartPalette(theme), [theme]);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState<Viewport>(() => latestViewport(candles.length));
  // The crosshair lives outside React state: the line is a shared value drawn by Skia on the UI
  // thread, and only the readout subscribes to the hovered candle (see hoverStore.ts).
  const [hover] = useState(createHoverStore);
  // The line's x is derived on the UI thread from the hovered index and the current window, so it
  // stays on the right candle when the window moves (replay adds a candle, zoom buttons, rotation).
  const hoverIndex = useSharedValue(-1);
  const viewStart = useSharedValue(viewport.start);
  const viewCount = useSharedValue(viewport.count);
  const plotWidth = useSharedValue(width);
  const crossX = useDerivedValue(() =>
    hoverIndex.value < 0 || plotWidth.value === 0 ? -1 : ((hoverIndex.value - viewStart.value + 0.5) * plotWidth.value) / viewCount.value,
  );
  const crossTop = useDerivedValue(() => vec(crossX.value, 0));
  const crossBottom = useDerivedValue(() => vec(crossX.value, height));
  const crossOpacity = useDerivedValue(() => (hoverIndex.value < 0 || plotWidth.value === 0 ? 0 : 1));
  const total = candles.length;

  // Follow new candles while the right edge is showing the latest one.
  const [seenTotal, setSeenTotal] = useState(total);
  if (seenTotal !== total) {
    setSeenTotal(total);
    const atRightEdge = viewport.start + viewport.count >= seenTotal;
    setViewport(followLatest && atRightEdge ? latestViewport(total, viewport.count) : clampViewport(viewport, total));
  }

  const size = useMemo(() => ({ width, height }), [width, height]);
  const extra = useMemo(() => levels.map((l) => l.price), [levels]);
  const range = useMemo(() => priceRange(candles, viewport, extra), [candles, viewport, extra]);
  const digits = useMemo(() => pricePrecision(candles), [candles]);

  // Gesture handlers read the latest values through this ref (they are created once).
  const live = useRef({ viewport, size, range, total, onTap });
  useLayoutEffect(() => {
    live.current = { viewport, size, range, total, onTap };
  });
  useLayoutEffect(() => {
    viewStart.value = viewport.start;
    viewCount.value = viewport.count;
    plotWidth.value = width;
  }, [viewport, width, viewStart, viewCount, plotWidth]);
  // New data that is not just more candles at the end: the hovered index may mean another candle now.
  const shownCandles = useRef(candles);
  useLayoutEffect(() => {
    const prev = shownCandles.current;
    shownCandles.current = candles;
    if (prev === candles) return;
    const appended = prev.length > 0 && candles.length >= prev.length && candles[prev.length - 1] === prev[prev.length - 1];
    if (!appended && hover.set(null)) hoverIndex.value = -1;
  }, [candles, hover, hoverIndex]);
  const gesture = useRef<Gesture>({ kind: 'idle' });
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  // eslint-disable-next-line react-hooks/refs -- refs are read only inside the gesture callbacks, never while rendering.
  const [responder] = useState(() => {
    const clearTimer = () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      pressTimer.current = null;
    };
    const setCrosshair = (index: number | null) => {
      if (hover.set(index)) hoverIndex.value = index ?? -1;
    };
    const pointAt = (x: number, y: number): ChartPoint | null => {
      const { viewport: v, size: s, range: r, total: t } = live.current;
      if (!r || s.width === 0 || t === 0) return null;
      return { index: indexAtX(x, v, s, t), price: priceAtY(y, r, s) };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Until the finger clearly moves sideways, a vertical swipe may still scroll the page.
      onPanResponderTerminationRequest: () => gesture.current.kind === 'idle' || gesture.current.kind === 'pending',
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        gesture.current = { kind: 'pending', x, y, start: live.current.viewport };
        clearTimer();
        pressTimer.current = setTimeout(() => {
          if (gesture.current.kind !== 'pending') return;
          gesture.current = { kind: 'crosshair' };
          setCrosshair(pointAt(x, y)?.index ?? null);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (e, g) => {
        const { viewport: v, size: s, total: t } = live.current;
        const g0 = gesture.current;
        if (e.nativeEvent.touches.length >= 2) {
          clearTimer();
          const d = touchDistance(e);
          if (g0.kind !== 'pinch') {
            const mid = ((e.nativeEvent.touches[0]?.locationX ?? 0) + (e.nativeEvent.touches[1]?.locationX ?? 0)) / 2;
            gesture.current = { kind: 'pinch', distance: d, anchor: indexAtX(mid, v, s, t), start: v };
            setCrosshair(null);
          } else if (g0.distance > 0 && d > 0) {
            setViewport(zoom(g0.start, d / g0.distance, g0.anchor, t));
          }
          return;
        }
        if (g0.kind === 'crosshair') {
          setCrosshair(pointAt(e.nativeEvent.locationX, e.nativeEvent.locationY)?.index ?? null);
          return;
        }
        if (g0.kind === 'pending' && Math.hypot(g.dx, g.dy) > TAP_SLOP) {
          clearTimer();
          // Only a sideways drag pans the chart; a vertical one is left to the page scroll.
          gesture.current = Math.abs(g.dx) >= Math.abs(g.dy) ? { kind: 'pan', x: g0.x, start: g0.start } : { kind: 'idle' };
        }
        const g1 = gesture.current;
        if (g1.kind === 'pan' && s.width > 0) {
          // Dragging right shows older candles.
          setViewport(pan(g1.start, -Math.round((g.dx / s.width) * g1.start.count), t));
        }
      },
      onPanResponderRelease: (e) => {
        clearTimer();
        const g0 = gesture.current;
        gesture.current = { kind: 'idle' };
        if (g0.kind === 'crosshair') {
          setCrosshair(null);
          return;
        }
        if (g0.kind === 'pending') {
          const point = pointAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
          if (point && live.current.onTap) live.current.onTap(point);
        }
      },
      onPanResponderTerminate: () => {
        clearTimer();
        gesture.current = { kind: 'idle' };
        setCrosshair(null);
      },
    });
  });

  const paths = useMemo(() => {
    if (!range || width === 0) return null;
    return {
      candles: style !== 'line' ? candlePaths(candles, viewport, range, size) : null,
      line: style === 'line' ? linePath(candles.map((c) => c.close), viewport, range, size) : null,
      overlays: overlays.map((o) => ({ id: o.id, tone: o.tone, d: linePath(o.series, viewport, range, size) })),
      drawings: drawingShapes(drawings, viewport, range, size),
      levels: levels.map((l) => ({ ...l, d: levelPath(l.price, range, size), y: yForPrice(l.price, range, size) })),
    };
  }, [candles, drawings, levels, overlays, range, size, style, viewport, width]);

  const paneSize = useMemo(() => ({ width, height: PANE_HEIGHT }), [width]);
  const panePaths = useMemo(() => {
    if (!pane || width === 0) return null;
    const r = paneRange(pane, viewport);
    if (!r) return null;
    return {
      lines: pane.lines.map((l) => ({ id: l.id, tone: l.tone, d: linePath(l.series, viewport, r, paneSize) })),
      bars: pane.bars ? barPaths(pane.bars, viewport, r, paneSize) : null,
      guides: pane.guides.map((g) => levelPath(g, r, paneSize)).join(''),
    };
  }, [pane, paneSize, viewport, width]);

  const paneLabel = pane ? pane.lines.map((l) => l.label).join(' · ') || 'Volume' : null;
  const description = useMemo(
    () => describeChart({ candles, viewport, digits, overlays, paneLabel, levels, drawings }),
    [candles, viewport, digits, overlays, paneLabel, levels, drawings],
  );
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View style={{ gap: spacing.xs }} testID={testID}>
      <ChartReadout hover={hover} candles={candles} digits={digits} realData={realData} />
      <View
        onLayout={onLayout}
        style={[styles.plot, { height, borderColor: colors.border, backgroundColor: colors.surface }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={description}
        accessibilityHint={onTap ? 'Tap to place the selected drawing tool. Use the buttons below to zoom and scroll.' : 'Use the buttons below to zoom and scroll.'}
        {...responder.panHandlers}
      >
        {paths ? (
          <Canvas style={{ width, height }}>
            {paths.drawings.zones ? <Path path={paths.drawings.zones} color={colors.primary} opacity={0.12} /> : null}
            {paths.candles?.upWicks ? <Path path={paths.candles.upWicks} color={colors.positive} style="stroke" strokeWidth={1} /> : null}
            {paths.candles?.downWicks ? <Path path={paths.candles.downWicks} color={colors.negative} style="stroke" strokeWidth={1} /> : null}
            {paths.candles?.upBodies ? (
              // Hollow style: rising candles are outlines, so up and down differ by shape, not colour alone.
              <Path path={paths.candles.upBodies} color={colors.positive} style={style === 'hollow' ? 'stroke' : 'fill'} strokeWidth={1.5} />
            ) : null}
            {paths.candles?.downBodies ? <Path path={paths.candles.downBodies} color={colors.negative} /> : null}
            {paths.line ? <Path path={paths.line} color={colors.text} style="stroke" strokeWidth={1.5} /> : null}
            {paths.overlays.map((o) => (o.d ? <Path key={o.id} path={o.d} color={colors[o.tone]} style="stroke" strokeWidth={1.25} /> : null))}
            {paths.drawings.lines ? <Path path={paths.drawings.lines} color={colors.primary} style="stroke" strokeWidth={1.5} /> : null}
            {paths.levels.map((l) => (
              <Path key={`${l.label}-${l.price}`} path={l.d} color={colors[l.tone]} style="stroke" strokeWidth={1.5} />
            ))}
            <Line p1={crossTop} p2={crossBottom} opacity={crossOpacity} color={colors.textMuted} style="stroke" strokeWidth={1} />
          </Canvas>
        ) : null}
        {/* Labels never take touches: touch positions must be relative to the chart, not to a label. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {paths
            ? [...paths.drawings.labels, ...paths.levels.map((l) => ({ y: l.y, text: l.label }))].map((label, i) => (
                <AppText
                  key={`${label.text}-${i}`}
                  variant="caption"
                  color="textSecondary"
                  style={[styles.label, { top: Math.max(0, Math.min(height - 16, label.y - 16)) }]}
                >
                  {label.text}
                </AppText>
              ))
            : null}
          {range ? (
            <>
              <AppText variant="caption" color="textSecondary" style={[styles.axis, { top: 2 }]}>
                {range.max.toFixed(digits)}
              </AppText>
              <AppText variant="caption" color="textSecondary" style={[styles.axis, { bottom: 2 }]}>
                {range.min.toFixed(digits)}
              </AppText>
            </>
          ) : null}
        </View>
      </View>
      {pane && panePaths ? (
        <View style={[styles.plot, { height: PANE_HEIGHT, borderColor: colors.border, backgroundColor: colors.surface }]} accessible accessibilityRole="image" accessibilityLabel={`${paneLabel ?? pane.id} indicator pane, for the same candles as the price chart above.`}>
          <Canvas style={{ width, height: PANE_HEIGHT }}>
            {panePaths.guides ? <Path path={panePaths.guides} color={colors.border} style="stroke" strokeWidth={1} /> : null}
            {panePaths.bars?.positive ? <Path path={panePaths.bars.positive} color={colors.positive} opacity={0.6} /> : null}
            {panePaths.bars?.negative ? <Path path={panePaths.bars.negative} color={colors.negative} opacity={0.6} /> : null}
            {panePaths.lines.map((l) => (l.d ? <Path key={l.id} path={l.d} color={colors[l.tone]} style="stroke" strokeWidth={1.25} /> : null))}
          </Canvas>
          <AppText variant="caption" color="textSecondary" style={[styles.axis, { top: 2 }]}>
            {pane.lines.map((l) => l.label).join(' · ') || 'Volume'}
          </AppText>
        </View>
      ) : null}
      <ChartControls viewport={viewport} total={total} onChange={setViewport} />
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  axis: { position: 'absolute', right: 4 },
  label: { position: 'absolute', left: 4 },
});
