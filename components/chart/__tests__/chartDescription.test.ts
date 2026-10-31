import { describeChart } from '../chartDescription';

const candle = (i: number, close: number) => ({ time: `2026-01-01T${String(i).padStart(2, '0')}:00:00.000Z`, open: close - 1, high: close + 2, low: close - 3, close, volume: null });

describe('describeChart (text alternative for the price chart)', () => {
  const candles = [candle(0, 100), candle(1, 104), candle(2, 98), candle(3, 110)];

  it('describes an empty chart', () => {
    expect(describeChart({ candles: [], viewport: { start: 0, count: 0 }, digits: 2 })).toBe('Price chart, no candles.');
  });

  it('summarises the visible candles: count, change, high and low', () => {
    const text = describeChart({ candles, viewport: { start: 0, count: 4 }, digits: 2 });
    expect(text).toBe('Price chart, 4 of 4 candles shown. From 100.00 to 110.00, up 10.00%. High 112.00, low 95.00. Last close 110.00.');
  });

  it('describes only the visible window and says when price fell', () => {
    const text = describeChart({ candles, viewport: { start: 1, count: 2 }, digits: 1 });
    expect(text).toContain('2 of 4 candles shown');
    expect(text).toContain('From 104.0 to 98.0, down 5.77%');
  });

  it('names the indicators, levels and drawings on the chart', () => {
    const text = describeChart({
      candles,
      viewport: { start: 0, count: 4 },
      digits: 2,
      overlays: [{ id: 'ma20', label: 'MA 20', series: [null, 101, 102, 103], tone: 'primary' }],
      paneLabel: 'RSI 14',
      levels: [{ price: 105, label: 'Stop 105', tone: 'negative' }],
      drawings: [{ kind: 'hline', price: 100 }, { kind: 'zone', top: 110, bottom: 108 }],
    });
    expect(text).toContain('Indicators: MA 20 at 103.00, RSI 14 below.');
    expect(text).toContain('Levels: Stop 105.');
    expect(text).toContain('Your drawings: 1 level line, 1 zone.');
  });
});
