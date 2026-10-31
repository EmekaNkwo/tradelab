import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import {
  barPaths,
  candlePaths,
  crosshairText,
  drawingShapes,
  levelPath,
  linePath,
  overlayLines,
  paneModel,
  paneRange,
  pricePrecision,
  toChartCandles,
  type ChartCandle,
} from '../chartModel';
import { addByPrices, clearDrawings, emptyDrawings, MAX_DRAWINGS, selectTool, tapChart, TYPED_TREND_SPAN, undoDrawing } from '../drawingTools';

const size = { width: 100, height: 100 };
const range = { min: 0, max: 10 };
const v = { start: 0, count: 10 };
const candle = (o: number, h: number, l: number, c: number, volume: number | null = 5): ChartCandle => ({
  time: '2020-01-01T00:00:00.000Z',
  open: o,
  high: h,
  low: l,
  close: c,
  volume,
});

describe('chart model', () => {
  it('converts decimal candles to numbers', () => {
    const [c] = toChartCandles([{ time: '2020-01-01T00:00:00.000Z' as UtcIso, open: dec('1.1'), high: dec('1.2'), low: dec('1'), close: dec('1.15'), volume: null }]);
    expect(c).toMatchObject({ open: 1.1, high: 1.2, low: 1, close: 1.15, volume: null });
  });

  it('draws up and down candles in separate paths at the right pixels', () => {
    const p = candlePaths([candle(2, 6, 1, 5), candle(5, 5, 3, 4)], v, range, size);
    // Slot 10px wide, body 7px, first candle centred at x=5; body from y=50 (price 5) to y=80 (price 2).
    expect(p.upBodies).toBe('M1.5 50h7v30h-7Z');
    expect(p.upWicks).toBe('M5 40V90');
    expect(p.downBodies).toBe('M11.5 50h7v10h-7Z');
    expect(p.downWicks).toBe('M15 50V70');
  });

  it('gives a flat candle a visible body and only draws the visible window', () => {
    const p = candlePaths([candle(5, 5, 5, 5), candle(1, 2, 1, 2)], { start: 1, count: 10 }, range, size);
    expect(p.upBodies).toBe('M1.5 80h7v10h-7Z');
    const flat = candlePaths([candle(5, 5, 5, 5)], v, range, size);
    expect(flat.upBodies).toContain('v1h');
  });

  it('breaks lines at gaps and bars from zero by sign', () => {
    expect(linePath([null, 2, 4, null, 6], v, range, size)).toBe('M15 80L25 60M45 40');
    const bars = barPaths([2, -2, null], v, { min: -5, max: 5 }, size);
    expect(bars.positive).toBe('M1.5 30h7v20h-7Z');
    expect(bars.negative).toBe('M11.5 50h7v20h-7Z');
  });

  it('builds overlays and indicator panes on request', () => {
    const cs = Array.from({ length: 60 }, (_, i) => candle(1 + i / 100, 1.02 + i / 100, 0.99 + i / 100, 1.01 + i / 100));
    expect(overlayLines(cs, []).length).toBe(0);
    expect(overlayLines(cs, ['sma20', 'ema50', 'bollinger']).map((l) => l.id)).toEqual(['sma20', 'ema50', 'bb-upper', 'bb-lower']);
    expect(overlayLines(cs, ['channel20']).map((l) => [l.id, l.label])).toEqual([
      ['ch-upper', expect.any(String)],
      ['ch-lower', expect.any(String)],
    ]);
    expect(paneModel(cs, 'none')).toBeNull();
    const rsiPane = paneModel(cs, 'rsi')!;
    expect(paneRange(rsiPane, v)).toEqual({ min: 0, max: 100 });
    expect(rsiPane.guides).toEqual([30, 70]);
    const vol = paneModel(cs, 'volume')!;
    expect(paneRange(vol, v)!.min).toBeLessThan(0.0001);
    expect(paneModel(cs, 'macd')!.bars).toHaveLength(60);
    expect(paneModel(cs, 'atr')!.lines[0]!.series).toHaveLength(60);
    expect(paneRange({ id: 'atr', lines: [{ id: 'x', label: 'x', series: [null], tone: 'primary' }], bars: null, fixedRange: null, guides: [] }, v)).toBeNull();
  });

  it('turns drawings into lines, zones, and Fibonacci labels', () => {
    const s = drawingShapes(
      [
        { kind: 'hline', price: 5, label: 'Stop' },
        { kind: 'trend', from: { index: 0, price: 0 }, to: { index: 9, price: 10 } },
        { kind: 'zone', top: 2, bottom: 4 },
        { kind: 'fib', from: 0, to: 10 },
      ],
      v,
      range,
      size,
    );
    expect(s.lines).toContain('M0 50H100');
    expect(s.lines).toContain('M5 100L95 0');
    expect(s.zones).toBe('M0 60H100V80H0Z');
    expect(s.labels.map((l) => l.text)).toEqual(['Stop', '0.0%', '23.6%', '38.2%', '50.0%', '61.8%', '78.6%', '100.0%']);
    expect(levelPath(10, range, size)).toBe('M0 0H100');
  });

  it('formats the crosshair with the data precision', () => {
    const c = candle(1.10012, 1.1005, 1.0999, 1.10031);
    expect(pricePrecision([c])).toBe(5);
    expect(pricePrecision([candle(150, 151, 149, 150.5)])).toBe(2);
    expect(crosshairText(c, 5)).toBe('Simulated 2020-01-01 00:00 · O 1.10012 H 1.10050 L 1.09990 C 1.10031');
  });
});

describe('drawing tools', () => {
  it('needs one tap for a level and two for the others', () => {
    let s = selectTool(emptyDrawings, 'hline');
    s = tapChart(s, { index: 3, price: 1.1 });
    expect(s.drawings).toEqual([{ kind: 'hline', price: 1.1 }]);
    s = selectTool(s, 'zone');
    s = tapChart(s, { index: 1, price: 1.0 });
    expect(s.pending).toEqual({ index: 1, price: 1.0 });
    s = tapChart(s, { index: 2, price: 1.2 });
    expect(s.drawings[1]).toEqual({ kind: 'zone', top: 1.2, bottom: 1.0 });
    s = selectTool(s, 'trend');
    s = tapChart(tapChart(s, { index: 0, price: 1 }), { index: 5, price: 2 });
    expect(s.drawings[2]).toEqual({ kind: 'trend', from: { index: 0, price: 1 }, to: { index: 5, price: 2 } });
    s = selectTool(s, 'fib');
    s = tapChart(tapChart(s, { index: 0, price: 1 }), { index: 5, price: 2 });
    expect(s.drawings[3]).toEqual({ kind: 'fib', from: 1, to: 2 });
  });

  it('ignores taps without a tool, toggles tools, undoes, clears, and caps the count', () => {
    expect(tapChart(emptyDrawings, { index: 0, price: 1 })).toBe(emptyDrawings);
    expect(selectTool(selectTool(emptyDrawings, 'fib'), 'fib').tool).toBeNull();
    let s = tapChart(selectTool(emptyDrawings, 'trend'), { index: 0, price: 1 });
    expect(undoDrawing(s).pending).toBeNull();
    s = tapChart(selectTool(emptyDrawings, 'hline'), { index: 0, price: 1 });
    expect(undoDrawing(s).drawings).toEqual([]);
    expect(clearDrawings(s).drawings).toEqual([]);
    let full = selectTool(emptyDrawings, 'hline');
    for (let i = 0; i < MAX_DRAWINGS + 3; i += 1) full = tapChart(full, { index: 0, price: i });
    expect(full.drawings).toHaveLength(MAX_DRAWINGS);
  });
});

describe('drawing by typed prices (Phase 4 review)', () => {
  const value = <T>(r: { ok: true; value: T } | { ok: false }) => {
    if (!r.ok) throw new Error('expected ok');
    return r.value;
  };
  it('adds levels, zones, Fibonacci, and trend lines without touch', () => {
    let s = value(addByPrices(emptyDrawings, 'hline', '1,1', '', 100));
    s = value(addByPrices(s, 'zone', '1.2', '1.1', 100));
    s = value(addByPrices(s, 'fib', '1.0', '1.3', 100));
    s = value(addByPrices(s, 'trend', '1.0', '1.1', 100));
    expect(s.drawings).toEqual([
      { kind: 'hline', price: 1.1 },
      { kind: 'zone', top: 1.2, bottom: 1.1 },
      { kind: 'fib', from: 1.0, to: 1.3 },
      { kind: 'trend', from: { index: 100 - TYPED_TREND_SPAN, price: 1.0 }, to: { index: 100, price: 1.1 } },
    ]);
  });
  it('rejects bad prices and respects the drawing limit', () => {
    expect(addByPrices(emptyDrawings, 'hline', 'abc', '', 10).ok).toBe(false);
    expect(addByPrices(emptyDrawings, 'zone', '1', '', 10).ok).toBe(false);
    expect(addByPrices(emptyDrawings, 'zone', '-1', '2', 10).ok).toBe(false);
    let full = emptyDrawings;
    for (let i = 0; i < MAX_DRAWINGS; i += 1) full = value(addByPrices(full, 'hline', '1', '', 10));
    expect(addByPrices(full, 'hline', '1', '', 10).ok).toBe(false);
  });
});
