/** Pure geometry and text summaries for the small SVG charts (AreaChart, BarActivityChart). */

export interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly width: number;
  readonly height: number;
  /** Space kept above the highest point for the value pill. */
  readonly top: number;
  readonly bottom: number;
}

/** min/max of the values (a loop, so long series cannot overflow the call stack), widened when flat so a constant
 * series sits mid-height instead of dividing by zero. Callers pass finite values (see `finitePoints`). */
export function valueRange(values: readonly number[]): { readonly min: number; readonly max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
}

/** Drops points whose value is NaN or infinite: they cannot be drawn or said, and would poison the range. */
export function finitePoints(points: readonly ChartPoint[]): readonly ChartPoint[] {
  return points.every((p) => Number.isFinite(p.value)) ? points : points.filter((p) => Number.isFinite(p.value));
}

/**
 * The selected index for `count` points: what the learner chose, else `initial`, else the last point, always
 * clamped into range (so data that shrinks or grows never leaves a stale index). `null` when there are no points.
 */
export function clampSelection(chosen: number | null, initial: number | undefined, count: number): number | null {
  if (count <= 0) return null;
  const wanted = chosen ?? initial ?? count - 1;
  return Math.min(count - 1, Math.max(0, Math.round(wanted)));
}

/** Points spread evenly across the width; a single point sits in the middle. */
export function toPoints(values: readonly number[], box: Box): XY[] {
  const { min, max } = valueRange(values);
  const usable = Math.max(1, box.height - box.top - box.bottom);
  const step = values.length > 1 ? box.width / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: values.length > 1 ? i * step : box.width / 2,
    y: box.top + (1 - (v - min) / (max - min)) * usable,
  }));
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * A smooth line through every point (monotone cubic, Fritsch–Carlson), so the curve never overshoots the data:
 * no invented highs or lows between points.
 */
export function smoothPath(points: readonly XY[]): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  if (points.length === 1) return `M${r(first.x)},${r(first.y)}`;
  const n = points.length;
  const dx = points.slice(1).map((p, i) => p.x - points[i]!.x);
  const slope = points.slice(1).map((p, i) => (p.y - points[i]!.y) / (dx[i] || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slope[0]!;
    if (i === n - 1) return slope[n - 2]!;
    // d3's monotoneX tangent: zero at a turning point, otherwise limited so the curve stays within the data.
    const s0 = slope[i - 1]!;
    const s1 = slope[i]!;
    if (s0 * s1 <= 0) return 0;
    const h0 = dx[i - 1]!;
    const h1 = dx[i]!;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) * 2;
  });
  let d = `M${r(first.x)},${r(first.y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const h = dx[i]! / 3;
    d += ` C${r(p0.x + h)},${r(p0.y + tangents[i]! * h)} ${r(p1.x - h)},${r(p1.y - tangents[i + 1]! * h)} ${r(p1.x)},${r(p1.y)}`;
  }
  return d;
}

/** The line closed down to the baseline, for the gradient fill under it. */
export function areaPath(points: readonly XY[], baseline: number): string {
  const line = smoothPath(points);
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${line} L${r(last.x)},${r(baseline)} L${r(first.x)},${r(baseline)} Z`;
}

/** Which point a touch at `x` selects: the nearest, clamped to the data. */
export function indexAtX(x: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  const i = Math.round((x / width) * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

/** Left edge for a pill of `pillWidth` centred on `x`, kept inside the chart. */
export function pillLeft(x: number, pillWidth: number, width: number): number {
  return Math.min(Math.max(0, x - pillWidth / 2), Math.max(0, width - pillWidth));
}

/** Move a selection by one step for screen-reader increment/decrement, clamped. */
export function stepIndex(index: number, delta: 1 | -1, count: number): number {
  return Math.min(Math.max(0, index + delta), Math.max(0, count - 1));
}

/**
 * What a screen reader hears for a chart: what it shows, the range, the first and last values, and the highest.
 * `format` turns a value into its display text.
 */
export function chartSummary(title: string, points: readonly ChartPoint[], format: (v: number) => string): string {
  if (points.length === 0) return `${title}: no data yet.`;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const high = points.reduce((best, p) => (p.value > best.value ? p : best), first);
  const low = points.reduce((best, p) => (p.value < best.value ? p : best), first);
  if (points.length === 1) return `${title}: ${first.label}, ${format(first.value)}.`;
  return `${title}, ${points.length} points from ${first.label} to ${last.label}. Starts at ${format(first.value)}, ends at ${format(last.value)}. Highest ${format(high.value)} (${high.label}), lowest ${format(low.value)} (${low.label}).`;
}

/** The selected point, said aloud: "Wed, 35 min". */
export function selectedText(points: readonly ChartPoint[], index: number | null, format: (v: number) => string): string | null {
  if (index === null) return null;
  const p = points[index];
  return p ? `${p.label}, ${format(p.value)}` : null;
}

/**
 * Bar heights as fractions of the tallest bar. Activity bars show amounts that cannot be negative (minutes,
 * counts), so a negative value is drawn as an empty bar (0); all-zero data gives all-empty bars.
 */
export function barFractions(values: readonly number[]): number[] {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  return values.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}
