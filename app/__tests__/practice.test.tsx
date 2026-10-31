import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import ChartLabScreen from '../(tabs)/practice/chart-lab';
import DrillScreen from '../(tabs)/practice/drill';
import PracticeScreen from '../(tabs)/practice/index';
import ReplayScreen from '../(tabs)/practice/replay';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
/** Gives the chart a size, as the phone's layout pass would. */
const layoutChart = async () => {
  const plot = await screen.findByLabelText(/^Price chart/);
  await act(async () => fireEvent(plot, 'layout', { nativeEvent: { layout: { width: 320, height: 260 } } }));
};

describe('Practice tab', () => {
  it('lists the tools and the four drills and opens them', async () => {
    await renderWith(<PracticeScreen />);
    expect(await screen.findByTestId('drill-size_it')).toBeTruthy();
    expect(screen.getByText('No finished replays yet.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('practice-chart-lab'));
    expect(router.push).toHaveBeenCalledWith('/practice/chart-lab');
    await fireEvent.press(screen.getByTestId('drill-breakout_or_fake'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/practice/drill', params: { kind: 'breakout_or_fake' } });
  });
});

describe('Chart Lab', () => {
  it('draws a labelled simulated chart with indicators and controls', async () => {
    await renderWith(<ChartLabScreen />);
    expect(await screen.findByTestId('simulated-label')).toHaveTextContent(/Simulated scenario/);
    await layoutChart();
    expect(screen.getAllByTestId('skia-path').length).toBeGreaterThanOrEqual(4);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'MA 20' }));
    await press('Zoom in');
    await press('Show older candles');
    await press('Jump to the latest candle');
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(/Last close/);
    await fireEvent.press(screen.getByRole('radio', { name: 'Line' }));
    await fireEvent.press(within(screen.getByLabelText('Drawing tool')).getByRole('radio', { name: 'Fibonacci' }));
    expect(screen.getByTestId('drawing-hint')).toHaveTextContent('Tap the start of the move, then its end.');
  });
});

describe('Chart Lab without touch (Phase 4 review)', () => {
  it('adds a zone by typed prices and reports bad input', async () => {
    await renderWith(<ChartLabScreen />);
    await screen.findByTestId('typed-first');
    await fireEvent.press(within(screen.getByLabelText('Drawing to add')).getByRole('radio', { name: 'Zone' }));
    await fireEvent.changeText(screen.getByTestId('typed-first'), '1.12');
    await press('Add drawing');
    expect(screen.getByTestId('typed-message')).toHaveTextContent('Second price must be a positive number');
    await fireEvent.changeText(screen.getByTestId('typed-second'), '1,1');
    await press('Add drawing');
    expect(screen.getByTestId('typed-message')).toHaveTextContent('Added.');
    expect(screen.getByText('1 drawings')).toBeTruthy();
    expect(screen.getByTestId('chart-readout')).toHaveTextContent(/Simulated \d{4}-/);
  });
});

describe('Drills', () => {
  it('hides what happens next until the learner commits, then explains and saves the answer', async () => {
    searchParams.current = { kind: 'breakout_or_fake' };
    await renderWith(<DrillScreen />);
    expect(await screen.findByText(/Real breakout, fake, or would you wait/)).toBeTruthy();
    expect(screen.getByText(/Commit to an answer first/)).toBeTruthy();
    await press('Wait for more evidence');
    expect(await screen.findByText(/Waiting is a valid plan/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Real breakout/ })).toBeDisabled();
    await waitFor(async () => {
      const saved = await harness.container.practice.drillAttempts();
      expect(saved.ok && saved.value.map((a) => [a.kind, a.optionId])).toEqual([['breakout_or_fake', 'wait']]);
    });
    await press('Another one');
    expect(screen.getByRole('button', { name: /Real breakout/ })).toBeEnabled();
  });

  it('shows a message for an unknown drill', async () => {
    searchParams.current = { kind: 'nope' };
    await renderWith(<DrillScreen />);
    expect(await screen.findByText('Drill not found')).toBeTruthy();
  });
});

describe('Replay', () => {
  it('reveals one candle at a time, trades with a stop, and saves a process review', async () => {
    await renderWith(<ReplayScreen />);
    expect(screen.getByTestId('fill-rules')).toHaveTextContent(/stop is assumed to fill first/);
    await press('Start replay');
    const before = (await screen.findByTestId('replay-time')).props.children as string;
    const left = Number(/(\d+) candles left/.exec(before)![1]);
    await press('Next candle');
    expect(screen.getByTestId('replay-time')).toHaveTextContent(new RegExp(`· ${left - 1} candles left`));
    await press('Step back');
    expect(screen.getByTestId('replay-time')).toHaveTextContent(new RegExp(`· ${left} candles left`));

    // A stop on the wrong side is refused with a reason.
    const lastClose = Number(screen.getByTestId('last-close').props.children);
    await fireEvent.changeText(screen.getByTestId('order-lots'), '0.01');
    await fireEvent.changeText(screen.getByTestId('order-stop'), (lastClose + 0.01).toFixed(5));
    await press(/Place buy market order/);
    expect(await screen.findByTestId('replay-error')).toHaveTextContent(/stop loss must be below/);
    await press('OK');

    await fireEvent.changeText(screen.getByTestId('order-stop'), (lastClose - 0.02).toFixed(5));
    await press(/Place buy market order/);
    expect(await screen.findByText('Pending order')).toBeTruthy();
    await press('Next candle');
    // Either the trade is open, or the next candle already hit the stop.
    if (screen.queryByTestId('replay-position')) await press('Close trade');

    await press('Finish and review');
    expect(await screen.findByTestId('replay-review-title')).toHaveTextContent('Process score 100%');
    await waitFor(async () => {
      const saved = await harness.container.practice.replayAttempts();
      expect(saved.ok && saved.value).toHaveLength(1);
    });
    await press('Replay this chart again');
    expect(await screen.findByTestId('replay-time')).toHaveTextContent(new RegExp(`· ${left} candles left`));
  });

  it('will not finish with a trade still open', async () => {
    await renderWith(<ReplayScreen />);
    await press('Start replay');
    await screen.findByTestId('replay-time');
    await press(/Place buy market order/);
    await press('Next candle');
    // No stop was set, so the trade is still open after one candle.
    expect(screen.getByTestId('replay-position')).toHaveTextContent(/unrealised/);
    await press('Finish and review');
    expect(await screen.findByTestId('replay-error')).toHaveTextContent(/Close the open trade/);
    const saved = await harness.container.practice.replayAttempts();
    expect(saved.ok && saved.value).toHaveLength(0);
  });
});
