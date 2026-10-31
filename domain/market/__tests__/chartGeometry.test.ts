import {
  candleWidth,
  clampViewport,
  drawingPrices,
  fibLevels,
  indexAtX,
  latestViewport,
  MAX_VISIBLE,
  MIN_VISIBLE,
  pan,
  priceAtY,
  priceRange,
  xForIndex,
  yForPrice,
  zoom,
} from '../chartGeometry';

const size = { width: 400, height: 200 };

describe('chart geometry', () => {
  it('opens on the latest candles and keeps the window inside the data', () => {
    expect(latestViewport(500, 80)).toEqual({ start: 420, count: 80 });
    expect(latestViewport(30, 80)).toEqual({ start: 0, count: 80 });
    expect(clampViewport({ start: -5, count: 3 }, 100)).toEqual({ start: 0, count: MIN_VISIBLE });
    expect(clampViewport({ start: 95, count: 1000 }, 1000)).toEqual({ start: 95, count: MAX_VISIBLE });
    expect(clampViewport({ start: 200, count: 40 }, 100)).toEqual({ start: 60, count: 40 });
  });

  it('pans and stops at either end', () => {
    expect(pan({ start: 50, count: 40 }, -10, 100)).toEqual({ start: 40, count: 40 });
    expect(pan({ start: 50, count: 40 }, 100, 100)).toEqual({ start: 60, count: 40 });
    expect(pan({ start: 5, count: 40 }, -100, 100)).toEqual({ start: 0, count: 40 });
  });

  it('zooms around the anchor candle', () => {
    const v = { start: 100, count: 100 };
    const z = zoom(v, 2, 150, 1000);
    expect(z).toEqual({ start: 125, count: 50 });
    // The window starts on a whole candle, so the anchor stays within one slot of where it was.
    expect(Math.abs(xForIndex(150, z, size) - xForIndex(150, v, size))).toBeLessThanOrEqual(size.width / z.count);
    expect(zoom(v, 0.5, 150, 1000)).toEqual({ start: 50, count: 200 });
    expect(zoom(v, 0, 150, 1000)).toBe(v);
  });

  it('maps prices and indexes both ways', () => {
    const range = { min: 1, max: 2 };
    expect(yForPrice(2, range, size)).toBe(0);
    expect(yForPrice(1, range, size)).toBe(200);
    expect(priceAtY(50, range, size)).toBe(1.75);
    const v = { start: 10, count: 20 };
    expect(xForIndex(10, v, size)).toBe(10);
    expect(indexAtX(0, v, size, 100)).toBe(10);
    expect(indexAtX(399, v, size, 100)).toBe(29);
    expect(indexAtX(5000, v, size, 15)).toBe(14);
    expect(candleWidth(v, size)).toBe(14);
  });

  it('price range covers visible candles and extra levels, with padding', () => {
    const candles = [
      { high: 5, low: 4 },
      { high: 6, low: 3 },
      { high: 100, low: 90 },
    ];
    expect(priceRange(candles, { start: 0, count: 2 }, [], 0)).toEqual({ min: 3, max: 6 });
    expect(priceRange(candles, { start: 0, count: 2 }, [2, null, Number.NaN], 0)).toEqual({ min: 2, max: 6 });
    const padded = priceRange(candles, { start: 0, count: 2 }, [], 0.1)!;
    expect(padded.min).toBeCloseTo(2.7);
    expect(priceRange([], { start: 0, count: 10 })).toBeNull();
    const flat = priceRange([{ high: 5, low: 5 }], { start: 0, count: 10 }, [], 0)!;
    expect(flat.max).toBeGreaterThan(flat.min);
  });

  it('Fibonacci retracement levels run from the end of the move back to its start', () => {
    const levels = fibLevels(1.1, 1.2);
    expect(levels[0]).toEqual({ ratio: 0, price: 1.2 });
    expect(levels.find((l) => l.ratio === 0.5)!.price).toBeCloseTo(1.15);
    expect(levels.find((l) => l.ratio === 0.618)!.price).toBeCloseTo(1.1382);
    expect(levels.at(-1)!.price).toBeCloseTo(1.1);
  });

  it('lists the prices each drawing needs', () => {
    expect(drawingPrices({ kind: 'hline', price: 1 })).toEqual([1]);
    expect(drawingPrices({ kind: 'zone', top: 2, bottom: 1 })).toEqual([2, 1]);
    expect(drawingPrices({ kind: 'fib', from: 1, to: 3 })).toEqual([1, 3]);
    expect(drawingPrices({ kind: 'trend', from: { index: 0, price: 1 }, to: { index: 5, price: 2 } })).toEqual([1, 2]);
  });
});
