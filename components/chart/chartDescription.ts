import type { ChartCandle, Drawing, LevelLine, OverlayLine, Viewport } from '../../features/practice';

/** Inputs for the price chart's text alternative (spec §31: chart annotations readable, screen-reader labels). */
export interface ChartDescriptionInput {
  readonly candles: readonly ChartCandle[];
  readonly viewport: Viewport;
  readonly digits: number;
  readonly overlays?: readonly OverlayLine[];
  /** The lower indicator pane's name, e.g. "RSI 14". */
  readonly paneLabel?: string | null;
  readonly levels?: readonly LevelLine[];
  readonly drawings?: readonly Drawing[];
}

const DRAWING_NAMES: Readonly<Record<Drawing['kind'], readonly [string, string]>> = {
  hline: ['level line', 'level lines'],
  trend: ['trend line', 'trend lines'],
  zone: ['zone', 'zones'],
  fib: ['Fibonacci retracement', 'Fibonacci retracements'],
};

function lastValue(series: readonly (number | null)[], end: number): number | null {
  for (let i = Math.min(end, series.length - 1); i >= 0; i -= 1) {
    const v = series[i];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function drawingsText(drawings: readonly Drawing[]): string | null {
  if (drawings.length === 0) return null;
  const counts = (Object.keys(DRAWING_NAMES) as Drawing['kind'][])
    .map((kind) => [kind, drawings.filter((d) => d.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${DRAWING_NAMES[kind][n === 1 ? 0 : 1]}`);
  return `Your drawings: ${counts.join(', ')}.`;
}

/**
 * What a screen reader hears for the chart: what is shown (the visible window), how price moved across it,
 * its high and low, and the indicators, levels and drawings on it.
 */
export function describeChart({ candles, viewport, digits, overlays = [], paneLabel = null, levels = [], drawings = [] }: ChartDescriptionInput): string {
  const start = Math.max(0, viewport.start);
  const visible = candles.slice(start, start + viewport.count);
  const first = visible[0];
  const last = visible[visible.length - 1];
  if (!first || !last) return 'Price chart, no candles.';
  const end = start + visible.length - 1;
  const change = first.close === 0 ? 0 : ((last.close - first.close) / first.close) * 100;
  const direction = change > 0 ? `up ${change.toFixed(2)}%` : change < 0 ? `down ${Math.abs(change).toFixed(2)}%` : 'unchanged';
  const high = Math.max(...visible.map((c) => c.high));
  const low = Math.min(...visible.map((c) => c.low));
  const indicators = [
    ...overlays.map((o) => {
      const v = lastValue(o.series, end);
      return v === null ? o.label : `${o.label} at ${v.toFixed(digits)}`;
    }),
    ...(paneLabel ? [`${paneLabel} below`] : []),
  ];
  return [
    `Price chart, ${visible.length} of ${candles.length} candles shown.`,
    `From ${first.close.toFixed(digits)} to ${last.close.toFixed(digits)}, ${direction}.`,
    `High ${high.toFixed(digits)}, low ${low.toFixed(digits)}.`,
    `Last close ${last.close.toFixed(digits)}.`,
    indicators.length > 0 ? `Indicators: ${indicators.join(', ')}.` : null,
    levels.length > 0 ? `Levels: ${levels.map((l) => l.label).join(', ')}.` : null,
    drawingsText(drawings),
  ]
    .filter((s): s is string => s !== null)
    .join(' ');
}
