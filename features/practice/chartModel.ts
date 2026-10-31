import type { OverlayId, PaneId } from '../../domain/market/chartIds';
import {
  atr,
  bollinger,
  candleWidth,
  ema,
  fibLevels,
  macd,
  priceChannel,
  priceRange,
  rsi,
  sma,
  xForIndex,
  yForPrice,
  type ChartSize,
  type Drawing,
  type PriceRange,
  type Series,
  type Viewport,
} from '../../domain/market';
import type { Candle } from '../../domain/models/markets';

/**
 * Turns candles into what the chart draws: SVG path strings and plain numbers.
 * Kept free of React and Skia so every coordinate can be unit-tested; the
 * component only hands these strings to the canvas.
 */

export interface ChartCandle {
  readonly time: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number | null;
}

/**
 * Converted candles, keyed by the (immutable) source candle. Replay states
 * share candle objects, so a tick converts only the newly revealed candle
 * instead of every candle on the chart. Entries go when the candle does.
 */
const converted = new WeakMap<Candle, ChartCandle>();

function toChartCandle(c: Candle): ChartCandle {
  const cached = converted.get(c);
  if (cached) return cached;
  const made: ChartCandle = {
    time: c.time,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: c.volume === null ? null : Number(c.volume),
  };
  converted.set(c, made);
  return made;
}

export function toChartCandles(candles: readonly Candle[]): readonly ChartCandle[] {
  return candles.map(toChartCandle);
}

/** `hollow`: rising candles are outlines and falling ones filled, so direction never depends on colour alone. */
export type ChartStyle = 'hollow' | 'candles' | 'line';
export type { OverlayId, PaneId } from '../../domain/market/chartIds';

export interface OverlayLine {
  readonly id: string;
  readonly label: string;
  readonly series: Series;
  /** Theme colour token. */
  readonly tone: 'primary' | 'modeReplay' | 'textMuted';
}

export const OVERLAYS: readonly { readonly id: OverlayId; readonly label: string }[] = [
  { id: 'sma20', label: 'MA 20' },
  { id: 'ema50', label: 'EMA 50' },
  { id: 'bollinger', label: 'Bollinger 20, 2' },
  { id: 'channel20', label: 'Channel 20' },
];

export const PANES: readonly { readonly id: PaneId; readonly label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'volume', label: 'Volume' },
  { id: 'rsi', label: 'RSI 14' },
  { id: 'macd', label: 'MACD' },
  { id: 'atr', label: 'ATR 14' },
];

export function overlayLines(candles: readonly ChartCandle[], enabled: readonly OverlayId[]): readonly OverlayLine[] {
  const closes = candles.map((c) => c.close);
  const lines: OverlayLine[] = [];
  if (enabled.includes('sma20')) lines.push({ id: 'sma20', label: 'MA 20', series: sma(closes, 20), tone: 'primary' });
  if (enabled.includes('ema50')) lines.push({ id: 'ema50', label: 'EMA 50', series: ema(closes, 50), tone: 'modeReplay' });
  if (enabled.includes('bollinger')) {
    const b = bollinger(closes, 20, 2);
    lines.push(
      { id: 'bb-upper', label: 'Upper band', series: b.upper, tone: 'textMuted' },
      { id: 'bb-lower', label: 'Lower band', series: b.lower, tone: 'textMuted' },
    );
  }
  if (enabled.includes('channel20')) {
    const ch = priceChannel(candles, 20);
    lines.push(
      { id: 'ch-upper', label: 'Channel high (prior 20)', series: ch.upper, tone: 'modeReplay' },
      { id: 'ch-lower', label: 'Channel low (prior 20)', series: ch.lower, tone: 'modeReplay' },
    );
  }
  return lines;
}

export interface PaneModel {
  readonly id: PaneId;
  readonly lines: readonly OverlayLine[];
  /** Bars (volume, MACD histogram), drawn from zero. */
  readonly bars: Series | null;
  /** Fixed range (RSI is always 0–100); null means fit to the visible values. */
  readonly fixedRange: PriceRange | null;
  /** Reference levels such as RSI 30/70. */
  readonly guides: readonly number[];
}

export function paneModel(candles: readonly ChartCandle[], id: PaneId): PaneModel | null {
  const closes = candles.map((c) => c.close);
  switch (id) {
    case 'none':
      return null;
    case 'volume':
      return { id, lines: [], bars: candles.map((c) => c.volume), fixedRange: null, guides: [] };
    case 'rsi':
      return { id, lines: [{ id: 'rsi', label: 'RSI 14', series: rsi(closes, 14), tone: 'primary' }], bars: null, fixedRange: { min: 0, max: 100 }, guides: [30, 70] };
    case 'macd': {
      const m = macd(closes);
      return {
        id,
        lines: [
          { id: 'macd', label: 'MACD', series: m.macd, tone: 'primary' },
          { id: 'signal', label: 'Signal', series: m.signal, tone: 'modeReplay' },
        ],
        bars: m.histogram,
        fixedRange: null,
        guides: [0],
      };
    }
    case 'atr':
      return { id, lines: [{ id: 'atr', label: 'ATR 14', series: atr(candles, 14), tone: 'primary' }], bars: null, fixedRange: null, guides: [] };
  }
}

/** Range of a pane's visible values (always including zero for bars). */
export function paneRange(pane: PaneModel, v: Viewport): PriceRange | null {
  if (pane.fixedRange) return pane.fixedRange;
  const slice = (s: Series) => s.slice(v.start, v.start + v.count).filter((x): x is number => x !== null && Number.isFinite(x));
  const values = [...pane.lines.flatMap((l) => slice(l.series)), ...(pane.bars ? [...slice(pane.bars), 0] : []), ...pane.guides];
  if (values.length === 0) return null;
  return priceRange(values.map((x) => ({ high: x, low: x })), { start: 0, count: values.length }, [], 0.08);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface CandlePaths {
  readonly upBodies: string;
  readonly downBodies: string;
  readonly upWicks: string;
  readonly downWicks: string;
}

/** Candle bodies and wicks for the visible window, split by direction so each gets one colour. */
export function candlePaths(candles: readonly ChartCandle[], v: Viewport, range: PriceRange, size: ChartSize): CandlePaths {
  const w = candleWidth(v, size);
  const out = { upBodies: [] as string[], downBodies: [] as string[], upWicks: [] as string[], downWicks: [] as string[] };
  const end = Math.min(candles.length, v.start + v.count);
  for (let i = v.start; i < end; i += 1) {
    const c = candles[i] as ChartCandle;
    const x = xForIndex(i, v, size);
    const up = c.close >= c.open;
    const top = yForPrice(Math.max(c.open, c.close), range, size);
    const bottom = yForPrice(Math.min(c.open, c.close), range, size);
    // A flat candle still gets a 1px body so it is visible.
    const h = Math.max(1, bottom - top);
    const body = `M${r1(x - w / 2)} ${r1(top)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;
    const wick = `M${r1(x)} ${r1(yForPrice(c.high, range, size))}V${r1(yForPrice(c.low, range, size))}`;
    (up ? out.upBodies : out.downBodies).push(body);
    (up ? out.upWicks : out.downWicks).push(wick);
  }
  return { upBodies: out.upBodies.join(''), downBodies: out.downBodies.join(''), upWicks: out.upWicks.join(''), downWicks: out.downWicks.join('') };
}

/** A line through the visible values; gaps (null) start a new segment. */
export function linePath(series: Series, v: Viewport, range: PriceRange, size: ChartSize): string {
  const parts: string[] = [];
  let drawing = false;
  const end = Math.min(series.length, v.start + v.count);
  for (let i = v.start; i < end; i += 1) {
    const value = series[i];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      drawing = false;
      continue;
    }
    parts.push(`${drawing ? 'L' : 'M'}${r1(xForIndex(i, v, size))} ${r1(yForPrice(value, range, size))}`);
    drawing = true;
  }
  return parts.join('');
}

/** Bars from zero (volume, MACD histogram), split by sign. */
export function barPaths(series: Series, v: Viewport, range: PriceRange, size: ChartSize): { readonly positive: string; readonly negative: string } {
  const w = candleWidth(v, size);
  const zero = yForPrice(Math.max(range.min, Math.min(0, range.max)), range, size);
  const pos: string[] = [];
  const neg: string[] = [];
  const end = Math.min(series.length, v.start + v.count);
  for (let i = v.start; i < end; i += 1) {
    const value = series[i];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    const x = xForIndex(i, v, size);
    const y = yForPrice(value, range, size);
    const top = Math.min(y, zero);
    const h = Math.max(1, Math.abs(zero - y));
    (value >= 0 ? pos : neg).push(`M${r1(x - w / 2)} ${r1(top)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`);
  }
  return { positive: pos.join(''), negative: neg.join('') };
}

export interface LevelLine {
  readonly price: number;
  readonly label: string;
  readonly tone: 'positive' | 'negative' | 'primary' | 'textMuted';
}

/** Horizontal lines for drawings, as the chart draws them. Trend lines are returned separately. */
export function drawingShapes(
  drawings: readonly Drawing[],
  v: Viewport,
  range: PriceRange,
  size: ChartSize,
): { readonly lines: string; readonly zones: string; readonly labels: readonly { readonly y: number; readonly text: string }[] } {
  const lines: string[] = [];
  const zones: string[] = [];
  const labels: { y: number; text: string }[] = [];
  const hline = (price: number) => `M0 ${r1(yForPrice(price, range, size))}H${size.width}`;
  for (const d of drawings) {
    switch (d.kind) {
      case 'hline':
        lines.push(hline(d.price));
        if (d.label) labels.push({ y: yForPrice(d.price, range, size), text: d.label });
        break;
      case 'trend':
        lines.push(
          `M${r1(xForIndex(d.from.index, v, size))} ${r1(yForPrice(d.from.price, range, size))}L${r1(xForIndex(d.to.index, v, size))} ${r1(yForPrice(d.to.price, range, size))}`,
        );
        break;
      case 'zone': {
        const top = yForPrice(Math.max(d.top, d.bottom), range, size);
        const bottom = yForPrice(Math.min(d.top, d.bottom), range, size);
        zones.push(`M0 ${r1(top)}H${size.width}V${r1(bottom)}H0Z`);
        break;
      }
      case 'fib':
        for (const l of fibLevels(d.from, d.to)) {
          lines.push(hline(l.price));
          labels.push({ y: yForPrice(l.price, range, size), text: `${(l.ratio * 100).toFixed(1)}%` });
        }
        break;
    }
  }
  return { lines: lines.join(''), zones: zones.join(''), labels };
}

export function levelPath(price: number, range: PriceRange, size: ChartSize): string {
  return `M0 ${r1(yForPrice(price, range, size))}H${size.width}`;
}

/** Decimal places to show for a price, from the data's own precision. */
export function pricePrecision(candles: readonly ChartCandle[]): number {
  const sample = candles.slice(-20).flatMap((c) => [c.open, c.close]);
  const places = sample.map((n) => (String(n).split('.')[1] ?? '').length);
  return Math.min(6, Math.max(2, ...places));
}

/** Generated charts carry made-up dates; label them so they are not mistaken for real history. */
export function simulatedTime(iso: string): string {
  return `Simulated ${iso.slice(0, 16).replace('T', ' ')}`;
}

/** Real data (spec §30) shows its actual candle time, in UTC. */
export function realTime(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

export function crosshairText(c: ChartCandle, digits: number, real = false): string {
  const f = (n: number) => n.toFixed(digits);
  return `${real ? realTime(c.time) : simulatedTime(c.time)} · O ${f(c.open)} H ${f(c.high)} L ${f(c.low)} C ${f(c.close)}`;
}
