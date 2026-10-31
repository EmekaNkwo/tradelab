import * as Skia from '@shopify/react-native-skia';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { crosshairText, pricePrecision, type ChartCandle } from '../../../features/practice';
import { ThemeProvider } from '../../../theme';
import { PriceChart } from '../PriceChart';

type Animated<T> = { value: T } | T;
const { lineRenders } = Skia as unknown as {
  lineRenders: { count: number; lastProps: { p1: Animated<{ x: number }>; opacity: Animated<number> } | null };
};
const read = <T,>(v: Animated<T>): T => (typeof v === 'object' && v !== null && 'value' in v ? v.value : v);
/** The crosshair line's current x, or null while it is hidden. */
const lineX = (): number | null => {
  const props = lineRenders.lastProps;
  if (!props) throw new Error('The crosshair line was never rendered');
  return read(props.opacity) > 0 ? read(props.p1).x : null;
};

// 100 candles; the default window shows the last 80 (indexes 20–99), so at 320 px wide each candle is 4 px.
const candles: ChartCandle[] = Array.from({ length: 100 }, (_, i) => ({
  time: `2024-01-01T${String(i % 24).padStart(2, '0')}:00:00Z`,
  open: 1.1 + i / 1000,
  high: 1.102 + i / 1000,
  low: 1.098 + i / 1000,
  close: 1.101 + i / 1000,
  volume: null,
}));
const digits = pricePrecision(candles);

/** A one-finger touch at x, with the touch history PanResponder reads (start at `startX`). */
// PanResponder ignores a move whose timestamp it has already seen, so each touch gets a new one.
let clock = 0;
const touch = (x: number, startX = x, y = 100) => {
  clock += 16;
  const t = clock;
  return {
    nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [{ locationX: x, pageX: x, pageY: y }], changedTouches: [], identifier: 0, timestamp: t },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
      touchBank: [
        { touchActive: true, startPageX: startX, startPageY: y, startTimeStamp: t, currentPageX: x, currentPageY: y, currentTimeStamp: t, previousPageX: x, previousPageY: y, previousTimeStamp: t },
      ],
    },
  };
};

const chart = (data: readonly ChartCandle[], followLatest = false) => (
  <ThemeProvider preference="light">
    <PriceChart candles={data} followLatest={followLatest} />
  </ThemeProvider>
);

const setup = async (data: readonly ChartCandle[] = candles, followLatest = false) => {
  const view = await render(chart(data, followLatest));
  const plot = screen.getByLabelText(/^Price chart/);
  await act(async () => fireEvent(plot, 'layout', { nativeEvent: { layout: { width: 320, height: 260 } } }));
  return { plot, view };
};

const longPress = async (plot: ReturnType<typeof screen.getByLabelText>, x: number) => {
  await act(async () => {
    fireEvent(plot, 'responderGrant', touch(x));
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
};

describe('PriceChart crosshair', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the OHLC under the finger after a long press, follows the drag, and clears on release', async () => {
    const { plot } = await setup();
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(/^Last close/);

    await longPress(plot, 2);
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(crosshairText(candles[20]!, digits));

    await act(async () => fireEvent(plot, 'responderMove', touch(10, 2)));
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(crosshairText(candles[22]!, digits));

    await act(async () => fireEvent(plot, 'responderRelease', touch(10)));
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(/^Last close/);
  });

  it('moves the crosshair line without re-rendering the chart', async () => {
    const { plot } = await setup();
    const before = lineRenders.count;
    expect(before).toBeGreaterThan(0);
    expect(lineX()).toBeNull();

    await longPress(plot, 2);
    // Candle 20 is the first in the window: its centre is half a candle (2 px) in.
    expect(lineX()).toBe(2);
    for (const x of [6, 10, 14, 18, 22]) {
      await act(async () => fireEvent(plot, 'responderMove', touch(x, 2)));
    }
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(crosshairText(candles[25]!, digits));
    expect(lineX()).toBe(22);

    await act(async () => fireEvent(plot, 'responderRelease', touch(22)));
    expect(lineX()).toBeNull();
    // The readout changed on every move, but the canvas (and its line) never re-rendered.
    expect(lineRenders.count).toBe(before);
  });

  it('keeps the line on the same candle when a new candle moves the window (replay)', async () => {
    const { plot, view } = await setup(candles, true);
    await longPress(plot, 2);
    expect(lineX()).toBe(2);

    const more = [...candles, { ...candles[99]!, time: '2024-01-05T04:00:00Z' }];
    await act(async () => view.rerender(chart(more, true)));
    // The window now starts one candle later, so candle 20 sits one candle (4 px) to the left.
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(crosshairText(candles[20]!, digits));
    expect(lineX()).toBe(-2);
  });

  it('clears the crosshair when the chart is given different data', async () => {
    const { plot, view } = await setup();
    await longPress(plot, 2);
    expect(lineX()).toBe(2);

    const other = candles.map((c) => ({ ...c, close: c.close + 0.01 }));
    await act(async () => view.rerender(chart(other)));
    expect(lineX()).toBeNull();
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(/^Last close/);
  });
});
