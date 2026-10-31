import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { HomeHeader } from '../../components/home/HomeHeader';
import { PaperAccountStats } from '../../components/paper/PaperAccountStats';
import { OrderTicket } from '../../components/practice/OrderTicket';
import { Card, ListRow, MoneyText, SimulatedBadge, spokenAmount } from '../../components/ui';
import { GREETING_REFRESH_MS, useGreeting } from '../../features/learning';
import { newPaperState, paperCandles } from '../../features/paper/paperSession';
import { practiceInstrument } from '../../features/paper';
import { PROGRESS_TABLES, useHomeProgress } from '../../features/progress';
import type { UtcIso } from '../../shared/time';
import type { HostNode } from '../../testing/a11y';
import { resetRouterMock, searchParams } from '../../testing/routerMock';
import { expectSimulatedFiguresBadged, simulatedFigureCount, unbadgedSimulatedFigures } from '../../testing/simulatedFigures';
import { createTestHarness, movableClock, TestProviders, type TestHarness } from '../../testing/testContainer';
import { ThemeProvider } from '../../theme';
import PaperAccountScreen from '../(tabs)/practice/paper/[id]';
import SandboxScreen from '../portfolio/sandbox';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

/** Fixes from the stage 3 review: money marking, spoken amounts, the focus-gated Home dashboard, the live greeting. */
let harness: TestHarness;
let clock: ReturnType<typeof movableClock>;
beforeEach(async () => {
  clock = movableClock();
  harness = await createTestHarness(undefined, clock);
  resetRouterMock();
});
afterEach(() => {
  jest.useRealTimers();
  harness.db.close();
});

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const inTheme = (ui: ReactElement) => render(<ThemeProvider preference="light">{ui}</ThemeProvider>);
const root = () => screen.container as unknown as HostNode;

async function paperAccount(): Promise<string> {
  const instrument = practiceInstrument('sim-eurusd')!;
  const state = newPaperState(instrument, paperCandles(instrument, 'range', 7, 'H1'), 7, '10000');
  if (!state.ok) throw new Error(state.error.message);
  const a = await harness.container.paper.create({ name: 'Review', instrumentId: instrument.id, scenarioKind: 'range', seed: 7, timeframe: 'H1', startingBalance: '10000', state: state.value }, NOW);
  if (!a.ok) throw new Error(a.error.message);
  return a.value.id;
}

describe('money marking and the badge check', () => {
  it('speaks a minus sign as a word', () => {
    expect(spokenAmount('−12.40 USD')).toBe('minus 12.40 USD');
    expect(spokenAmount('-3.00 USD')).toBe('minus 3.00 USD');
    expect(spokenAmount('5.00 USD')).toBe('5.00 USD');
  });

  it('MoneyText and money ListRow values are marked, so an unbadged one fails the check', async () => {
    await inTheme(
      <View>
        <MoneyText testID="m">−1,200.50 USD</MoneyText>
        <ListRow title="Account" value="−3.00 USD" valueIsMoney testID="row" />
        <ListRow title="Plain" value="82%" />
      </View>,
    );
    expect(screen.getByTestId('m')).toHaveProp('accessibilityLabel', 'minus 1,200.50 USD');
    expect(screen.getByTestId('row').props.accessibilityLabel).toMatch(/minus 3\.00 USD/);
    expect(simulatedFigureCount(root())).toBe(2);
    expect(unbadgedSimulatedFigures(root())).toHaveLength(2);
  });

  it('passes inside a badged card and cannot pass vacuously when a minimum is given', async () => {
    await inTheme(
      <Card>
        <SimulatedBadge kind="paper" />
        <MoneyText>10.00 USD</MoneyText>
      </Card>,
    );
    expectSimulatedFiguresBadged(root(), { atLeast: 1 });
    expect(() => expectSimulatedFiguresBadged(root(), { atLeast: 2 })).toThrow();
  });

  it('the replay order ticket carries its badge and shows no money of its own', async () => {
    await inTheme(<OrderTicket lastPrice="1.10000" onPlace={() => true} />);
    expect(screen.getAllByLabelText(/simulated|replay/i).length).toBeGreaterThan(0);
    expectSimulatedFiguresBadged(root());
    expect(simulatedFigureCount(root())).toBe(0);
  });

  it('the paper account card marks costs, free margin and exposure, read with "paper"', async () => {
    const id = await paperAccount();
    searchParams.current = { id };
    await renderWith(<PaperAccountScreen />);
    await screen.findByTestId('paper-stats');
    expect(screen.getByLabelText('Free margin, paper, 10,000.00 USD')).toBeTruthy();
    expect(screen.getByLabelText('Costs paid, paper, 0.00 USD')).toBeTruthy();
    expect(screen.getByLabelText('Exposure, paper, 0.00 USD')).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 8 });
    expect(PaperAccountStats).toBeDefined();
  });

  it('the order check shows grouped, marked amounts', async () => {
    const id = await paperAccount();
    searchParams.current = { id };
    await renderWith(<PaperAccountScreen />);
    await screen.findByTestId('paper-ticket');
    await fireEvent.changeText(screen.getByTestId('paper-size'), '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Check against my risk rules' }));
    const margin = await screen.findByTestId('paper-check-margin');
    expect(margin).toHaveTextContent(/^[\d,]+\.\d\d USD$/);
    expect(margin.props.accessibilityLabel).toMatch(/^paper, [\d,]+\.\d\d USD/);
    expectSimulatedFiguresBadged(root(), { atLeast: 9 });
  });

  it('sandbox best, typical and worst picks are marked money in a badged card', async () => {
    await renderWith(<SandboxScreen />);
    await screen.findByTestId('sandbox-best');
    for (const id of ['sandbox-best', 'sandbox-median', 'sandbox-worst']) expect(screen.getByTestId(id)).toHaveTextContent(/USD|\$/);
    expectSimulatedFiguresBadged(root(), { atLeast: 3 });
  });
});

describe('Home dashboard refreshes only while Home is focused', () => {
  function Probe({ active }: { readonly active: boolean }) {
    const p = useHomeProgress(active);
    return <View testID={`state-${p.status}`} />;
  }

  it('defers background writes to one rebuild on return', async () => {
    const get = jest.spyOn(harness.container.settings, 'get');
    const view = await renderWith(<Probe active />);
    await screen.findByTestId('state-success');
    const initial = get.mock.calls.length;

    await act(async () => harness.container.bus.emit(PROGRESS_TABLES));
    await waitFor(() => expect(get.mock.calls.length).toBe(initial + 1));

    await view.rerender(
      <TestProviders container={harness.container}>
        <Probe active={false} />
      </TestProviders>,
    );
    await act(async () => {
      harness.container.bus.emit(PROGRESS_TABLES);
      harness.container.bus.emit(PROGRESS_TABLES);
    });
    expect(get.mock.calls.length).toBe(initial + 1);

    await view.rerender(
      <TestProviders container={harness.container}>
        <Probe active />
      </TestProviders>,
    );
    await waitFor(() => expect(get.mock.calls.length).toBe(initial + 2));
  });
});

describe('greeting', () => {
  function GreetingProbe({ active }: { readonly active: boolean }) {
    return <View testID={`greeting-${useGreeting('Africa/Lagos', active)}`} />;
  }

  it('moves from morning to afternoon while Home stays open, and re-reads the clock on focus', async () => {
    jest.useFakeTimers();
    const view = await renderWith(<GreetingProbe active />);
    expect(screen.getByTestId('greeting-Good morning')).toBeTruthy();
    clock.set('2026-10-29T11:30:00.000Z'); // 12:30 in Lagos
    await act(async () => {
      jest.advanceTimersByTime(GREETING_REFRESH_MS);
    });
    expect(screen.getByTestId('greeting-Good afternoon')).toBeTruthy();

    await view.rerender(
      <TestProviders container={harness.container}>
        <GreetingProbe active={false} />
      </TestProviders>,
    );
    clock.set('2026-10-29T18:00:00.000Z'); // 19:00 in Lagos
    await act(async () => {
      jest.advanceTimersByTime(GREETING_REFRESH_MS * 2);
    });
    expect(screen.getByTestId('greeting-Good afternoon')).toBeTruthy();
    await view.rerender(
      <TestProviders container={harness.container}>
        <GreetingProbe active />
      </TestProviders>,
    );
    expect(screen.getByTestId('greeting-Good evening')).toBeTruthy();
  });

  it('holds the greeting line while the time zone loads; the bell dot is the warning colour', async () => {
    await inTheme(<HomeHeader greeting={null} due={{ due: true, label: 'Reminders: today’s class is waiting' }} />);
    expect(screen.getByTestId('home-greeting-placeholder', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('home-greeting')).toBeNull();
    const { lightTheme } = jest.requireActual<typeof import('../../theme')>('../../theme');
    expect(screen.getByTestId('home-bell-dot', { includeHiddenElements: true })).toHaveStyle({ backgroundColor: lightTheme.colors.warning });
  });
});
