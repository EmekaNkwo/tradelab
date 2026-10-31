import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { conventionsGist } from '../../components/backtest/conventionsGist';
import { gridPath, linePath } from '../../components/backtest/LineChart';
import { realDataNote } from '../../components/chart/ChartHeader';
import { BADGE_MARKER, CARD_MARKER } from '../../components/ui/simulated';
import { pickAndCheckCsv, saveImport } from '../../features/marketData';
import { hourlyCsv } from '../../testing/csvFixtures';
import { HEADLINE_KEYS, metricKind, pnlParts } from '../../components/backtest/metricDisplay';
import { OrderTicket } from '../../components/practice/OrderTicket';
import { strategyChips } from '../../components/strategies/strategyChips';
import { backtestSetup, defaultRunForm, formatUsd, METRIC_ROWS, outOfSampleLine, runBacktestSliced, runInputs, signedR, statsLine, templateFor } from '../../features/backtest';
import type { Container } from '../../features/app';
import type { UtcIso } from '../../shared/time';
import { accessibilityProblems, type HostNode } from '../../testing/a11y';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { expectSimulatedFiguresBadged, simulatedFigureCount } from '../../testing/simulatedFigures';
import { fixtureContent } from '../../testing/strategyFixtures';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import ChartLabScreen from '../(tabs)/practice/chart-lab';
import DrillScreen from '../(tabs)/practice/drill';
import ReplayScreen from '../(tabs)/practice/replay';
import StrategiesScreen from '../(tabs)/strategies/index';
import CompareScreen from '../backtest/compare';
import ResultScreen from '../backtest/result/[id]';
import StrategyScreen from '../strategy/[id]';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

/** Restyle stage 5a: Chart Lab, Replay, drills (brief §5.4), strategies and backtests (§5.5). */
let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
  searchParams.current = {};
});
afterEach(() => harness.db.close());

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const renderWith = (ui: ReactElement, container: Container = harness.container) => render(<TestProviders container={container}>{ui}</TestProviders>);
const root = () => screen.container as unknown as HostNode;
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const TREND = templateFor('trend-following-moving-averages')!;

/** Imports the hourly EUR/USD fixture as the learner's own data (the same path the Data screen uses). */
async function importedEurusd() {
  harness.datasetFiles.nextCsv = { name: 'eurusd-h1.csv', text: hourlyCsv(400) };
  const picked = await pickAndCheckCsv(harness.container);
  if (!picked.ok || !picked.value) throw new Error('pick');
  const saved = await saveImport(harness.container, picked.value, { symbol: 'EURUSD', name: 'Euro', market: 'forex', currency: 'USD', utcOffset: '+00:00' });
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

/** Text nodes whose own text matches, each with whether a card around it shows a SimulatedBadge. */
function badgedTexts(pattern: RegExp): { readonly text: string; readonly badged: boolean }[] {
  const textOf = (n: HostNode | string): string => (typeof n === 'string' ? n : n.children.map(textOf).join(''));
  return root()
    .queryAll((n) => n.type === 'Text' && pattern.test(textOf(n)))
    .map((n) => {
      let badged = false;
      for (let p = n.parent; p; p = p.parent) if (p.props[CARD_MARKER] === true && p.queryAll((b) => b.props[BADGE_MARKER] === true).length > 0) badged = true;
      return { text: textOf(n), badged };
    });
}

async function savedRun(capital = '10000') {
  const v = await harness.container.backtests.saveVersion({ strategyId: null, name: 'Trend', definition: { ...TREND.definition, timeframe: 'H1' }, templateId: TREND.strategyId, note: '' }, NOW);
  if (!v.ok) throw new Error(v.error.message);
  const inputs = runInputs(v.value.definition, { ...defaultRunForm(v.value.definition, 4), candles: '1000', capital }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  if (!inputs.ok) throw new Error('inputs');
  const ds = await harness.container.datasets.load(inputs.value.dataset);
  if (!ds.ok) throw new Error('data');
  const setup = backtestSetup(v.value.definition, inputs.value, ds.value);
  if (!setup.ok) throw new Error(setup.error.message);
  const r = await runBacktestSliced(setup.value, { yieldToLoop: async () => undefined });
  if (!r.ok || r.value.kind !== 'done') throw new Error('run');
  const run = await harness.container.backtests.saveRun(v.value.strategyId, v.value.version, inputs.value, r.value.result, NOW);
  if (!run.ok) throw new Error(run.error.message);
  return run.value;
}

describe('Replay', () => {
  it('shows the instrument chip and keeps balance, equity and open P/L in Replay-badged cards', async () => {
    await renderWith(<ReplayScreen />);
    await press('Start replay');
    await screen.findByTestId('replay-time');
    // The chip keeps the line the flows assert, with the timeframe in it.
    expect(within(screen.getByTestId('replay-header')).getByText('Breakout · H1')).toBeTruthy();
    expect(within(screen.getByTestId('replay-header')).getByLabelText('Replay, simulated money')).toBeTruthy();
    expect(within(screen.getByTestId('replay-balance')).getByLabelText(/^Balance, replay, [\d,]+\.\d\d USD$/)).toBeTruthy();
    expect(within(screen.getByTestId('replay-balance')).getByLabelText(/^Equity, replay, /)).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 2 });

    await press(/Place buy market order/);
    await press('Next candle');
    expect(screen.getByTestId('replay-position')).toHaveTextContent(/unrealised/);
    expect(within(screen.getByTestId('replay-position')).getByLabelText(/^Unrealised result, replay, /)).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 3 });
    expect(accessibilityProblems(root())).toEqual([]);
  });

  it('the controls pill has only the replay’s own controls, and they keep their rules', async () => {
    await renderWith(<ReplayScreen />);
    await press('Start replay');
    const controls = await screen.findByTestId('replay-controls');
    expect(within(controls).getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Step back', 'Play', 'Next candle']);
    expect(within(controls).getByRole('button', { name: 'Step back' })).toBeDisabled();
    await press('Next candle');
    expect(within(controls).getByRole('button', { name: 'Step back' })).toBeEnabled();
    await press('Play');
    expect(within(screen.getByTestId('replay-controls')).getByRole('button', { name: 'Next candle' })).toBeDisabled();
    await press('Pause');
    expect(within(screen.getByTestId('replay-controls')).getByRole('button', { name: 'Next candle' })).toBeEnabled();
  });

  it('the review shows the net result as a signed P/L in its badged card', async () => {
    await renderWith(<ReplayScreen />);
    await press('Start replay');
    await screen.findByTestId('replay-time');
    await press(/Place buy market order/);
    await press('Next candle');
    if (screen.queryByTestId('replay-position')) await press('Close trade');
    await press('Finish and review');
    expect(await screen.findByTestId('replay-net-result')).toBeTruthy();
    expect(screen.getByTestId('replay-net-result').props.accessibilityLabel).toMatch(/^Net result, replay, (gain|loss|no change)/);
    expectSimulatedFiguresBadged(root(), { atLeast: 3 });
    // The review's own sentences carry money ("Result +x", "Net result +x", domain/market/replayReview.ts): each sits
    // in a card with the Replay badge.
    const sentences = badgedTexts(/(Net result|Result) [+−-]?\d/);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.filter((t) => !t.badged)).toEqual([]);
  });
});

describe('Replay dates', () => {
  it('a replay of real data shows its candle date in the badge as YYYY-MM-DD', async () => {
    const d = await importedEurusd();
    searchParams.current = { datasetId: d.id };
    await renderWith(<ReplayScreen />);
    await press('Start replay');
    const header = await screen.findByTestId('replay-header');
    expect(within(header).getByLabelText(/^Replay, simulated money, \d{4}-\d{2}-\d{2}$/)).toBeTruthy();
    expect(within(header).getByText(/^Replay · \d{4}-\d{2}-\d{2}$/)).toBeTruthy();
  });

  it('a generated replay shows no date, because its dates are made up', async () => {
    await renderWith(<ReplayScreen />);
    await press('Start replay');
    const header = await screen.findByTestId('replay-header');
    expect(within(header).getByLabelText('Replay, simulated money')).toBeTruthy();
    expect(within(header).getByText('Replay')).toBeTruthy();
    expect(within(header).queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
  });
});

describe('Order ticket', () => {
  it('chooses Buy or Sell by tinted segments with words, and still shows no money', async () => {
    const onPlace = jest.fn(() => true);
    await renderWith(<OrderTicket lastPrice="1.10000" onPlace={onPlace} />);
    expect(screen.getByRole('radio', { name: 'Buy' }).props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'Sell' }));
    expect(screen.getByRole('radio', { name: 'Sell' }).props.accessibilityState).toEqual({ selected: true });
    await press('Place sell market order');
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ side: 'sell', type: 'market' }));
    expect(simulatedFigureCount(root())).toBe(0);
    expect(accessibilityProblems(root())).toEqual([]);
  });
});

describe('Chart Lab', () => {
  it('has a Simulated chip and circular tools: picking fills one, picking it again puts it down', async () => {
    await renderWith(<ChartLabScreen />);
    const header = await screen.findByTestId('chart-lab-header');
    expect(within(header).getByLabelText('Simulated money, not real')).toBeTruthy();
    expect(within(header).getByText(/ · H1$/)).toBeTruthy();
    const tray = screen.getByLabelText('Drawing tool');
    const zone = within(tray).getByRole('radio', { name: 'Zone' });
    expect(zone.props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(screen.queryByTestId('tool-zone-selected')).toBeNull();
    await fireEvent.press(zone);
    expect(within(screen.getByLabelText('Drawing tool')).getByRole('radio', { name: 'Zone' }).props.accessibilityState.selected).toBe(true);
    // Shown by a tick and a ring as well as the brand fill, not by colour alone.
    expect(screen.getByTestId('tool-zone-selected')).toBeTruthy();
    expect(screen.getByTestId('drawing-hint')).toHaveTextContent('Tap the top of the zone, then the bottom.');
    await fireEvent.press(within(screen.getByLabelText('Drawing tool')).getByRole('radio', { name: 'Zone' }));
    expect(within(screen.getByLabelText('Drawing tool')).getByRole('radio', { name: 'Zone' }).props.accessibilityState.selected).toBe(false);
    expect(screen.queryByTestId('tool-zone-selected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear drawings' })).toBeDisabled();
    expect(simulatedFigureCount(root())).toBe(0);
  });
});

describe('Chart Lab on real data', () => {
  it('shows the flag pair, the data’s own labels and no simulated badge or money', async () => {
    const d = await importedEurusd();
    searchParams.current = { datasetId: d.id };
    await renderWith(<ChartLabScreen />);
    const header = await screen.findByTestId('chart-lab-header');
    expect(within(header).getByTestId('chart-lab-header-instrument', { includeHiddenElements: true })).toBeTruthy();
    expect(within(header).getByText('EURUSD · H1')).toBeTruthy();
    expect(within(header).getByTestId('chart-lab-header-note')).toHaveTextContent('Your data · imported');
    expect(within(header).queryByLabelText(/Simulated money/)).toBeNull();
    expect(screen.getByText('Imported: eurusd-h1.csv')).toBeTruthy();
    expect(screen.queryByTestId('simulated-label')).toBeNull();
    expect(simulatedFigureCount(root())).toBe(0);
    expect(accessibilityProblems(root())).toEqual([]);
  });
});

describe('Drills', () => {
  it('shows the drill in a Simulated chip and no money', async () => {
    searchParams.current = { kind: 'find_the_trend' };
    await renderWith(<DrillScreen />);
    const header = await screen.findByTestId('drill-header');
    expect(within(header).getByLabelText('Simulated money, not real')).toBeTruthy();
    expectSimulatedFiguresBadged(root());
    expect(simulatedFigureCount(root())).toBe(0);
  });
});

describe('Backtest report', () => {
  it('labels everything Backtest · Simulated, shows headline tiles, and folds the conventions', async () => {
    const run = await savedRun();
    searchParams.current = { id: run.id };
    await renderWith(<ResultScreen />);
    await screen.findByTestId('result-metrics');
    expect(screen.getAllByText('Backtest · Simulated').length).toBeGreaterThanOrEqual(4);
    for (const key of HEADLINE_KEYS) expect(screen.getByTestId(`headline-${key}`)).toBeTruthy();
    expect(within(screen.getByTestId('headline-maxDrawdown')).getByLabelText(/^Maximum drawdown, backtest, \d+\.\d\d%$/)).toBeTruthy();
    // Final equity and costs are money; the equity summary marks both its amounts.
    expect(screen.getByLabelText(new RegExp(`^Final equity, backtest, ${formatUsd(run.result.metrics.finalEquity).replace(/[.]/g, '\\.')}`))).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 4 });
    // The average result in R is signed, with the result arrow, and is not counted as money.
    expect(within(screen.getByTestId('headline-expectancyR')).getByLabelText(/^Average result \(R\), backtest, (gain of|loss of|no gain or loss,) \d+\.\d{3} R$/)).toBeTruthy();
    expect(within(screen.getByTestId('headline-expectancyR')).getByText(/^[+−±]\d+\.\d{3}R$/)).toBeTruthy();
    // Spec §16.3: every report lists its conventions, so they are open on load, right under the curves.
    expect(within(screen.getByTestId('conventions-list')).getByText(/Survivorship bias: not applicable/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conventions used' }).props.accessibilityState).toEqual({ expanded: true });
    expect(accessibilityProblems(root())).toEqual([]);
    // Folded, one line still names the fill rule, costs and survivorship.
    await press('Conventions used');
    expect(screen.queryByTestId('conventions-list')).toBeNull();
    expect(screen.getByTestId('conventions-gist')).toHaveTextContent(/next candle’s open.*Commission.*Survivorship bias/);
    // The equity summary is shown once to screen readers: in the chart's label, not again as text.
    expect(screen.getByTestId('equity-curve-summary', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });

  it('lists repeated trades with a signed P/L and R', async () => {
    const run = await savedRun();
    searchParams.current = { id: run.id };
    await renderWith(<ResultScreen />);
    await press('Repeat the run and list trades');
    expect(await screen.findByText('Same result', {}, { timeout: 20000 })).toBeTruthy();
    const first = screen.getAllByTestId('trade-row')[0]!;
    expect(within(first).getByLabelText(/^Trade 1 result, backtest, (gain|loss|no change) .* USD, [\d.]+ R$/)).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 5 });
  }, 45_000);
});

describe('Comparison Studio', () => {
  it('badges every metric card and marks the money in it', async () => {
    const a = await savedRun();
    const b = await savedRun('5000');
    searchParams.current = { ids: `${a.id},${b.id}` };
    await renderWith(<CompareScreen />);
    await screen.findByTestId('comparison');
    expect(screen.getAllByTestId('compare-maxDrawdown')).toHaveLength(2);
    expect(screen.getByLabelText(/^Run 2, Final equity, backtest, /)).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 4 });
  });
});

describe('Strategy Library', () => {
  it('cards show the content’s level and markets, and Backtest only for pages with a builder version', async () => {
    await renderWith(<StrategiesScreen />);
    const trend = await screen.findByTestId('strategy-trend-following-moving-averages');
    expect(within(trend).getByText('Backtest')).toBeTruthy();
    expect(within(trend).getByText('Intermediate')).toBeTruthy();
    expect(within(trend).getByText('Forex')).toBeTruthy();
    const carry = screen.getByTestId('strategy-carry-concept');
    expect(within(carry).queryByText('Backtest')).toBeNull();
    await fireEvent.press(trend);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/strategy/[id]', params: { id: 'trend-following-moving-averages' } });
    expect(accessibilityProblems(root())).toEqual([]);
  });

  it('names a trader on a card only when the reviewed content does', async () => {
    await renderWith(<StrategiesScreen />, { ...harness.container, content: fixtureContent() });
    const documented = await screen.findByTestId('strategy-fixture-documented');
    const trader = fixtureContent().trader('fixture-trader')!;
    expect(within(documented).getByText(trader.name)).toBeTruthy();
    expect(within(screen.getByTestId('strategy-trend-following-moving-averages')).queryByText(trader.name)).toBeNull();
  });

  it('the strategy hero shows the content’s source quality, and nothing when it cites none', async () => {
    searchParams.current = { id: 'fixture-documented' };
    const first = await renderWith(<StrategyScreen />, { ...harness.container, content: fixtureContent() });
    expect(await screen.findByTestId('strategy-source-quality')).toHaveTextContent('Primary source');
    await first.unmount();
    searchParams.current = { id: 'trend-following-moving-averages' };
    await renderWith(<StrategyScreen />);
    expect(await screen.findByTestId('strategy-hero')).toHaveTextContent(/Trend following with moving averages/);
    expect(screen.queryByTestId('strategy-source-quality')).toBeNull();
  });
});

describe('stage 5a view helpers', () => {
  it('sorts every metric into P/L, money or plain text', () => {
    expect(METRIC_ROWS.filter((r) => metricKind(r.key) === 'pnl').map((r) => r.key)).toEqual(['expectancy', 'averageWin', 'averageLoss', 'largestGain', 'largestLoss']);
    expect(METRIC_ROWS.filter((r) => metricKind(r.key) === 'money').map((r) => r.key)).toEqual(['commissionAndSwap', 'finalEquity']);
    expect(metricKind('winRate')).toBe('plain');
  });

  it('splits a P/L metric into its direction and unsigned amount, and gives none for n/a', () => {
    const m = { ...({} as Parameters<typeof pnlParts>[0]), averageLoss: -12.5, largestGain: 40, expectancy: null };
    expect(pnlParts(m, 'averageLoss', formatUsd)).toEqual({ direction: 'down', amount: '12.50 USD' });
    expect(pnlParts(m, 'largestGain', formatUsd)).toEqual({ direction: 'up', amount: '40.00 USD' });
    expect(pnlParts(m, 'expectancy', formatUsd)).toBeNull();
  });

  it('signs every average result in R, with ± for none', () => {
    expect(signedR(0.1234)).toBe('+0.123R');
    expect(signedR(-0.05)).toBe('−0.050R');
    expect(signedR(0.0001)).toBe('±0.000R');
    expect(statsLine({ trades: 2, wins: 1, losses: 1, winRate: 0.5, averageWin: 1, averageLoss: -1, expectancy: 0, expectancyR: -0.2 } as never)).toBe('2 trades · average −0.200R · win rate 50%');
    expect(outOfSampleLine('holdout', [{ label: 'Out-of-sample', trades: 3, expectancyR: 0.4 } as never])).toBe('3 trades · +0.400R');
  });

  it('the folded conventions line uses the run’s own fill, cost and survivorship lines', () => {
    const lines = ['Data: simulated.', 'Decisions use only candles that have closed. A signal on a close is filled at the next candle’s open.', 'Commission is charged on entry and exit; swap is charged for each new UTC day a trade is held.', 'Survivorship bias: not applicable here, because the one simulated market always exists. With real data, more.'];
    expect(conventionsGist(lines)).toBe(`${lines[1]} ${lines[2]} Survivorship bias: not applicable here, because the one simulated market always exists.`);
    expect(conventionsGist(['Data: simulated.'])).toBe('');
  });

  it('labels real chart data by where it came from', () => {
    expect(realDataNote('user_import')).toBe('Your data · imported');
    expect(realDataNote('historical')).toBe('Your data · historical');
  });

  it('builds chips only from the content and what is switched on', () => {
    const s = { level: 'beginner' as const, markets: ['forex' as const] };
    expect(strategyChips(s, { replay: false, backtest: false, completed: false }).map((c) => c.label)).toEqual(['Beginner', 'Forex']);
    expect(strategyChips(s, { replay: true, backtest: true, completed: true }).map((c) => c.label)).toEqual(['Beginner', 'Forex', 'Replay', 'Backtest', 'Completed']);
  });

  it('draws the dotted grid as short dashes on three lines, and nothing with no size', () => {
    expect(gridPath(0, 100)).toBe('');
    const d = gridPath(12, 100);
    expect(d).toBe('M0 25.0L2 25.0M6 25.0L8 25.0M0 50.0L2 50.0M6 50.0L8 50.0M0 75.0L2 75.0M6 75.0L8 75.0');
    expect(linePath([1, 2], 10, 10)).toBe('M0.0 6.0L10.0 4.0');
  });
});

