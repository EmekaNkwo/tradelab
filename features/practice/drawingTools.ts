import type { Drawing } from '../../domain/market';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';

/**
 * Drawing tools for a phone (spec §13.1): pick a tool in the tray, then tap
 * the chart. A horizontal line needs one tap; trend lines, zones, and
 * Fibonacci retracements need two (start, then end).
 */

export type DrawingTool = 'hline' | 'trend' | 'zone' | 'fib';

export const DRAWING_TOOLS: readonly { readonly id: DrawingTool; readonly label: string; readonly hint: string }[] = [
  { id: 'hline', label: 'Level', hint: 'Tap a price to draw a horizontal line.' },
  { id: 'trend', label: 'Trend line', hint: 'Tap where the line starts, then where it ends.' },
  { id: 'zone', label: 'Zone', hint: 'Tap the top of the zone, then the bottom.' },
  { id: 'fib', label: 'Fibonacci', hint: 'Tap the start of the move, then its end.' },
];

export interface ChartPoint {
  readonly index: number;
  readonly price: number;
}

export interface DrawingState {
  readonly tool: DrawingTool | null;
  /** First tap of a two-tap tool. */
  readonly pending: ChartPoint | null;
  readonly drawings: readonly Drawing[];
}

export const MAX_DRAWINGS = 30;

export const emptyDrawings: DrawingState = { tool: null, pending: null, drawings: [] };

export function selectTool(state: DrawingState, tool: DrawingTool | null): DrawingState {
  return { ...state, tool: state.tool === tool ? null : tool, pending: null };
}

function build(tool: DrawingTool, a: ChartPoint, b: ChartPoint): Drawing {
  switch (tool) {
    case 'hline':
      return { kind: 'hline', price: b.price };
    case 'trend':
      return { kind: 'trend', from: a, to: b };
    case 'zone':
      return { kind: 'zone', top: Math.max(a.price, b.price), bottom: Math.min(a.price, b.price) };
    case 'fib':
      return { kind: 'fib', from: a.price, to: b.price };
  }
}

/** Applies a tap on the chart. Without a tool selected, taps do nothing. */
export function tapChart(state: DrawingState, point: ChartPoint): DrawingState {
  const { tool } = state;
  if (!tool) return state;
  if (state.drawings.length >= MAX_DRAWINGS) return { ...state, pending: null };
  if (tool !== 'hline' && !state.pending) return { ...state, pending: point };
  const drawing = build(tool, state.pending ?? point, point);
  return { ...state, pending: null, drawings: [...state.drawings, drawing] };
}

export function undoDrawing(state: DrawingState): DrawingState {
  return state.pending ? { ...state, pending: null } : { ...state, drawings: state.drawings.slice(0, -1) };
}

export function clearDrawings(state: DrawingState): DrawingState {
  return { ...state, pending: null, drawings: [] };
}

/** Bars between the two ends of a trend line entered by price. */
export const TYPED_TREND_SPAN = 20;

/**
 * Adds a drawing from typed prices instead of taps (for screen readers and
 * anyone who finds precise taps hard). A level uses the first price; a trend
 * line runs from `TYPED_TREND_SPAN` candles before the latest one (first price)
 * to the latest (second price).
 */
export function addByPrices(state: DrawingState, tool: DrawingTool, first: string, second: string, latestIndex: number): Result<DrawingState, AppError> {
  const parse = (text: string, label: string): Result<number, AppError> => {
    const n = Number(text.trim().replace(',', '.'));
    return text.trim() !== '' && Number.isFinite(n) && n > 0 ? ok(n) : err(validationError(`${label} must be a positive number`));
  };
  const a = parse(first, tool === 'hline' ? 'Price' : 'First price');
  if (!a.ok) return a;
  if (state.drawings.length >= MAX_DRAWINGS) return err(validationError(`You can have up to ${MAX_DRAWINGS} drawings. Clear some first.`));
  if (tool === 'hline') return ok({ ...state, pending: null, drawings: [...state.drawings, { kind: 'hline', price: a.value }] });
  const b = parse(second, 'Second price');
  if (!b.ok) return b;
  const end = Math.max(0, latestIndex);
  const from: ChartPoint = { index: Math.max(0, end - TYPED_TREND_SPAN), price: a.value };
  return ok({ ...state, pending: null, drawings: [...state.drawings, build(tool, from, { index: end, price: b.value })] });
}
