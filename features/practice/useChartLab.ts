import { useMemo, useState } from 'react';
import { generateScenario, type ScenarioKind } from '../../domain/market';
import type { Candle, Timeframe } from '../../domain/models/markets';
import { useContainer } from '../app';
import { toChartCandles, type ChartStyle, type OverlayId, type PaneId } from './chartModel';
import { addByPrices, clearDrawings, emptyDrawings, selectTool, tapChart, undoDrawing, type ChartPoint, type DrawingState, type DrawingTool } from './drawingTools';
import { seedFrom } from './replaySession';
import type { ChartLabPreset } from './chartPreset';

export const CHART_LAB_CANDLES = 240;
/** How far "Earlier" and "Later" move through real data. */
export const CHART_LAB_STEP = 120;

/** Real candles to chart instead of a simulated scenario (spec §30), with the label shown on the chart. */
export interface RealChartData {
  readonly label: string;
  readonly timeframe: Timeframe;
  readonly candles: readonly Candle[];
}

/** Free practice on a simulated chart (or the learner's own real data): indicators, drawing tools, and a fresh chart on demand. */
export function useChartLab(preset: ChartLabPreset | null = null, real: RealChartData | null = null) {
  const c = useContainer();
  const [kind, setKind] = useState<ScenarioKind>(preset?.kind ?? 'pullback');
  const [timeframe, setTimeframe] = useState<Timeframe>('H1');
  const [seed, setSeed] = useState(() => seedFrom(c.clock.now()));
  const [style, setStyle] = useState<ChartStyle>('hollow');
  const [overlays, setOverlays] = useState<readonly OverlayId[]>(preset?.overlays ?? []);
  const [pane, setPane] = useState<PaneId>(preset?.pane ?? 'volume');
  const [drawing, setDrawing] = useState<DrawingState>(emptyDrawings);

  const scenario = useMemo(() => generateScenario({ kind, seed, timeframe, count: CHART_LAB_CANDLES }), [kind, seed, timeframe]);
  const total = real?.candles.length ?? 0;
  // The window into real data ends at this candle (exclusive); it starts at the most recent candles.
  const [end, setEnd] = useState<number | null>(null);
  const windowEnd = real ? Math.min(total, Math.max(Math.min(CHART_LAB_CANDLES, total), end ?? total)) : 0;
  // Keyed on the candles, not the `real` object: screens build that object inline, and the
  // indicators memoised on `candles` must only be recomputed when the data or the window changes.
  const realCandles = real?.candles ?? null;
  const candles = useMemo(
    () => toChartCandles(realCandles ? realCandles.slice(Math.max(0, windowEnd - CHART_LAB_CANDLES), windowEnd) : scenario.candles),
    [realCandles, scenario, windowEnd],
  );
  const move = (by: number) => {
    setEnd(Math.min(total, Math.max(Math.min(CHART_LAB_CANDLES, total), windowEnd + by)));
    setDrawing(clearDrawings);
  };

  return {
    kind,
    timeframe: real?.timeframe ?? timeframe,
    seed,
    label: real?.label ?? scenario.label,
    real: real !== null,
    /** Real data only: which candles are shown, 1-based, of how many. */
    window: real ? { from: Math.max(0, windowEnd - CHART_LAB_CANDLES) + 1, to: windowEnd, total } : null,
    earlier: () => move(-CHART_LAB_STEP),
    later: () => move(CHART_LAB_STEP),
    candles,
    style,
    overlays,
    pane,
    drawing,
    setKind: (k: ScenarioKind) => {
      setKind(k);
      setDrawing(clearDrawings);
    },
    setTimeframe,
    setStyle,
    setOverlays,
    setPane,
    newChart: () => {
      setSeed((s) => (s * 48271) % 2147483647 || 1);
      setDrawing(clearDrawings);
    },
    selectTool: (tool: DrawingTool | null) => setDrawing((d) => selectTool(d, tool)),
    tap: (point: ChartPoint) => setDrawing((d) => tapChart(d, point)),
    /** Adds the selected tool's drawing from typed prices; returns an error message, or null when added. */
    addTyped: (tool: DrawingTool, first: string, second: string): string | null => {
      const r = addByPrices(drawing, tool, first, second, candles.length - 1);
      if (!r.ok) return r.error.message;
      setDrawing(r.value);
      return null;
    },
    undo: () => setDrawing(undoDrawing),
    clear: () => setDrawing(clearDrawings),
  };
}
