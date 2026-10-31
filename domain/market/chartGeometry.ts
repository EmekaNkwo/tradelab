/**
 * Chart geometry (spec §13.1: drawing and calculation logic is independently
 * testable). Maps candle indexes and prices to pixels and back, and handles
 * zoom and pan of the visible window. No rendering here.
 */

export interface Viewport {
  /** Index of the first visible candle. */
  readonly start: number;
  /** Number of candle slots visible. */
  readonly count: number;
}

export interface PriceRange {
  readonly min: number;
  readonly max: number;
}

export interface ChartSize {
  readonly width: number;
  readonly height: number;
}

export interface Hl {
  readonly high: number;
  readonly low: number;
}

export const MIN_VISIBLE = 10;
export const MAX_VISIBLE = 400;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The latest `count` candles, as a chart opens. */
export function latestViewport(total: number, count = 80): Viewport {
  const c = clamp(count, MIN_VISIBLE, MAX_VISIBLE);
  return { start: Math.max(0, total - c), count: c };
}

/** Keeps the window inside the data; the right edge may sit at the last candle. */
export function clampViewport(v: Viewport, total: number): Viewport {
  const count = clamp(Math.round(v.count), MIN_VISIBLE, MAX_VISIBLE);
  const start = clamp(Math.round(v.start), 0, Math.max(0, total - Math.min(count, total)));
  return { start, count };
}

/** Pans by a number of candles (positive = towards newer candles). */
export function pan(v: Viewport, candles: number, total: number): Viewport {
  return clampViewport({ ...v, start: v.start + candles }, total);
}

/** Zooms around `anchor` (a candle index), keeping it at the same place on screen. factor > 1 zooms in. */
export function zoom(v: Viewport, factor: number, anchor: number, total: number): Viewport {
  if (!(factor > 0)) return v;
  const count = clamp(Math.round(v.count / factor), MIN_VISIBLE, MAX_VISIBLE);
  const share = v.count > 0 ? (anchor - v.start) / v.count : 0;
  return clampViewport({ start: anchor - share * count, count }, total);
}

/** High/low of the visible candles and any extra levels (stop, target, indicators), with padding. */
export function priceRange(candles: readonly Hl[], v: Viewport, extra: readonly (number | null)[] = [], padding = 0.06): PriceRange | null {
  const visible = candles.slice(v.start, v.start + v.count);
  const values = [...visible.flatMap((c) => [c.high, c.low]), ...extra.filter((x): x is number => x !== null && Number.isFinite(x))];
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) {
    // A flat window still needs a non-zero range, or every price maps to the same pixel.
    const half = (Math.abs(max) * 0.01 || 1) / 2;
    return { min: min - half, max: max + half };
  }
  const span = max - min;
  return { min: min - span * padding, max: max + span * padding };
}

/** Centre x of a candle slot. */
export function xForIndex(index: number, v: Viewport, size: ChartSize): number {
  const slot = size.width / v.count;
  return (index - v.start + 0.5) * slot;
}

export function candleWidth(v: Viewport, size: ChartSize): number {
  return Math.max(1, (size.width / v.count) * 0.7);
}

export function yForPrice(price: number, range: PriceRange, size: ChartSize): number {
  return size.height - ((price - range.min) / (range.max - range.min)) * size.height;
}

/** The candle under a touch, clamped to the visible window. */
export function indexAtX(x: number, v: Viewport, size: ChartSize, total: number): number {
  const i = v.start + Math.floor((x / size.width) * v.count);
  return clamp(i, v.start, Math.min(total, v.start + v.count) - 1);
}

export function priceAtY(y: number, range: PriceRange, size: ChartSize): number {
  return range.max - (y / size.height) * (range.max - range.min);
}

/** Standard Fibonacci retracement ratios. A teaching tool, not a prediction. */
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** Retracement levels of a move from `from` to `to`: 0% at `to`, 100% back at `from`. */
export function fibLevels(from: number, to: number): readonly { readonly ratio: number; readonly price: number }[] {
  return FIB_RATIOS.map((ratio) => ({ ratio, price: to - (to - from) * ratio }));
}

export type Drawing =
  | { readonly kind: 'hline'; readonly price: number; readonly label?: string }
  | { readonly kind: 'trend'; readonly from: { readonly index: number; readonly price: number }; readonly to: { readonly index: number; readonly price: number } }
  | { readonly kind: 'zone'; readonly top: number; readonly bottom: number }
  | { readonly kind: 'fib'; readonly from: number; readonly to: number };

/** Prices a drawing needs on screen, so the range can include them. */
export function drawingPrices(d: Drawing): readonly number[] {
  switch (d.kind) {
    case 'hline':
      return [d.price];
    case 'trend':
      return [d.from.price, d.to.price];
    case 'zone':
      return [d.top, d.bottom];
    case 'fib':
      return [d.from, d.to];
  }
}
