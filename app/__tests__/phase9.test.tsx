import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { backtestSetup, defaultRunForm, runBacktestSliced, runInputs, templateFor, type RunForm } from '../../features/backtest';
import type { Container } from '../../features/app';
import type { UtcIso } from '../../shared/time';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import PracticeScreen from '../(tabs)/practice/index';
import StrategiesScreen from '../(tabs)/strategies/index';
import BuilderScreen from '../backtest/builder';
import CompareScreen from '../backtest/compare';
import BacktestHome from '../backtest/index';
import PlaybookScreen from '../backtest/playbook/[id]';
import ResultScreen from '../backtest/result/[id]';
import RunScreen from '../backtest/run';
import MyStrategyScreen from '../backtest/strategy/[id]';
import PortfolioScreen from '../portfolio/index';
import SandboxScreen from '../portfolio/sandbox';
import StrategyScreen from '../strategy/[id]';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
  searchParams.current = {};
});
afterEach(() => {
  harness.db.close();
  jest.restoreAllMocks();
});

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const renderWith = (ui: ReactElement, container: Container = harness.container) => render(<TestProviders container={container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const lastCall = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1]?.[0] as { pathname: string; params: Record<string, string> };

const TREND = templateFor('trend-following-moving-averages')!;

async function savedStrategy(instrumentId = 'sim-eurusd') {
  const definition = { ...TREND.definition, instrumentId, timeframe: 'H1' as const, direction: instrumentId === 'sim-eurusd' ? ('both' as const) : ('long' as const) };
  const def = definition.direction === 'long' ? { ...definition, shortEntry: null, shortExit: null } : definition;
  const v = await harness.container.backtests.saveVersion({ strategyId: null, name: `Trend ${instrumentId}`, definition: def, templateId: TREND.strategyId, note: '' }, NOW);
  if (!v.ok) throw new Error(v.error.message);
  return v.value;
}

async function savedRun(instrumentId = 'sim-eurusd', capital = '10000', split: RunForm['split'] = { kind: 'holdout', inSamplePercent: 70 }) {
  const v = await savedStrategy(instrumentId);
  const inputs = runInputs(v.definition, { ...defaultRunForm(v.definition, 4), candles: '1000', capital, split }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  if (!inputs.ok) throw new Error('inputs');
  const ds = await harness.container.datasets.load(inputs.value.dataset);
  if (!ds.ok) throw new Error('data');
  const setup = backtestSetup(v.definition, inputs.value, ds.value);
  if (!setup.ok) throw new Error(setup.error.message);
  const r = await runBacktestSliced(setup.value, { yieldToLoop: async () => undefined });
  if (!r.ok || r.value.kind !== 'done') throw new Error('run');
  const run = await harness.container.backtests.saveRun(v.strategyId, v.version, inputs.value, r.value.result, NOW);
  if (!run.ok) throw new Error(run.error.message);
  return { version: v, run: run.value };
}

describe('Backtesting Lab entry points', () => {
  it('a rule-based strategy page offers a backtest of its own copy, with no empty sections elsewhere', async () => {
    searchParams.current = { id: 'trend-following-moving-averages' };
    await renderWith(<StrategyScreen />);
    expect(await screen.findByTestId('section-backtest')).toBeTruthy();
    await press('Run this as a backtest');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/backtest/builder', params: { template: 'trend-following-moving-averages' } });
  });

  it('discretionary pages show no backtest section; investing pages link the sandbox', async () => {
    searchParams.current = { id: 'carry-concept' };
    const first = await renderWith(<StrategyScreen />);
    expect(await screen.findByTestId('strategy-screen')).toBeTruthy();
    expect(screen.queryByTestId('section-backtest')).toBeNull();
    await first.unmount();
    searchParams.current = { id: 'dividend-index-investing' };
    await renderWith(<StrategyScreen />);
    await press('Open the investing sandbox');
    expect(router.push).toHaveBeenCalledWith('/portfolio/sandbox');
  });

  it('the Strategies and Practice tabs link the lab and the portfolio', async () => {
    const tab = await renderWith(<StrategiesScreen />);
    await fireEvent.press(await screen.findByTestId('strategies-backtest'));
    expect(router.push).toHaveBeenCalledWith('/backtest');
    await tab.unmount();
    await renderWith(<PracticeScreen />);
    await fireEvent.press(await screen.findByTestId('practice-portfolio'));
    expect(router.push).toHaveBeenCalledWith('/portfolio');
  });

  it('the lab home labels everything simulated and lists templates', async () => {
    await renderWith(<BacktestHome />);
    expect(await screen.findByText('No strategies yet')).toBeTruthy();
    expect(screen.getAllByText(/Simulated data/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('template-channel-breakout'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/backtest/builder', params: { template: 'channel-breakout' } });
  });
});

describe('Strategy Builder', () => {
  it('saves a template copy as the learner’s own strategy, describing it in plain English', async () => {
    searchParams.current = { template: 'trend-following-moving-averages' };
    await renderWith(<BuilderScreen />);
    expect(await screen.findByText('Your own copy')).toBeTruthy();
    expect(within(screen.getByTestId('builder-summary')).getByText(/Stop loss: 2 × ATR 14/)).toBeTruthy();
    await press('Save strategy');
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const target = lastCall(router.replace);
    expect(target.pathname).toBe('/backtest/strategy/[id]');
    const versions = await harness.container.backtests.versions(target.params.id as string);
    expect(versions.ok && versions.value.map((v) => [v.version, v.name, v.templateId])).toEqual([[1, 'My Trend following (EMA 50)', 'trend-following-moving-averages']]);
  });

  it('blocks saving an incomplete strategy and says why', async () => {
    await renderWith(<BuilderScreen />);
    const entry = await screen.findByTestId('group-longEntry');
    await fireEvent.press(within(entry).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Fix these before saving')).toBeTruthy();
    expect(screen.getByText('Give the strategy a name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save strategy' }).props.accessibilityState?.disabled).toBe(true);
  });

  it('editing saves a new version and shows every changed setting', async () => {
    const v = await savedStrategy();
    searchParams.current = { strategyId: v.strategyId };
    const builder = await renderWith(<BuilderScreen />);
    const risk = await screen.findByTestId('risk-percent');
    await fireEvent.press(within(risk).getByRole('button', { name: /^Raise / }));
    expect(await screen.findByText('riskPercent: 1 → 1.1')).toBeTruthy();
    await press('Save as v2');
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    await builder.unmount();
    searchParams.current = { id: v.strategyId };
    await renderWith(<MyStrategyScreen />);
    expect(await screen.findAllByTestId('version-row')).toHaveLength(2);
    expect(screen.getByText('  riskPercent: 1 → 1.1')).toBeTruthy();
  });
});

/** These run whole sliced backtests through the screen (about 3 s each unloaded), so they get more than the 15 s UI default. */
const RUN_TEST_TIMEOUT_MS = 45_000;

describe('running and reading a backtest', () => {
  it('runs with progress, saves the run, and opens the report', async () => {
    const v = await savedStrategy();
    searchParams.current = { strategyId: v.strategyId };
    const runScreen = await renderWith(<RunScreen />);
    expect(await screen.findByText(/If one candle reaches both the stop and the target/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('run-capital'), 'abc');
    await press('Run backtest');
    expect(await screen.findByText(/Starting capital must be/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('run-capital'), '10000');
    await press('Run backtest');
    await waitFor(() => expect(router.replace).toHaveBeenCalled(), { timeout: 20000 });
    const target = lastCall(router.replace);
    expect(target.pathname).toBe('/backtest/result/[id]');
    await runScreen.unmount();

    searchParams.current = { id: target.params.id as string };
    await renderWith(<ResultScreen />);
    expect(await screen.findByTestId('metric-maxDrawdown')).toBeTruthy();
    expect(screen.getByText('Simulated results')).toBeTruthy();
    expect(screen.getAllByTestId('split-row').map((n) => n.props.children)).toEqual([expect.stringMatching(/^In-sample/), expect.stringMatching(/^Out-of-sample/)]);
    expect(screen.getAllByTestId('regime-row')).toHaveLength(4);
    expect(screen.getByText(/Survivorship bias: not applicable/)).toBeTruthy();
    await press('Repeat the run and list trades');
    expect(await screen.findByText('Same result', {}, { timeout: 20000 })).toBeTruthy();
    expect(screen.getAllByTestId('trade-row').length).toBeGreaterThan(0);
  }, RUN_TEST_TIMEOUT_MS);

  it('runs a sensitivity check over nearby values', async () => {
    const { run } = await savedRun();
    searchParams.current = { id: run.id };
    await renderWith(<ResultScreen />);
    await press('Run sensitivity check');
    await waitFor(() => expect(screen.getAllByTestId('sensitivity-row').length).toBeGreaterThan(2), { timeout: 30000 });
    expect(screen.getByText(/\(current\)/)).toBeTruthy();
  }, RUN_TEST_TIMEOUT_MS);
});

describe('Comparison Studio', () => {
  it('refuses runs on different markets', async () => {
    const a = await savedRun('sim-eurusd');
    const b = await savedRun('sim-gold');
    searchParams.current = { ids: `${a.run.id},${b.run.id}` };
    await renderWith(<CompareScreen />);
    expect(await screen.findByText('These runs cannot be compared')).toBeTruthy();
    expect(screen.queryByTestId('comparison')).toBeNull();
  });

  it('shows comparable runs side by side in the order picked, with warnings', async () => {
    const a = await savedRun();
    const b = await savedRun('sim-eurusd', '5000');
    searchParams.current = { ids: `${a.run.id},${b.run.id}` };
    await renderWith(<CompareScreen />);
    expect(await screen.findByTestId('comparison')).toBeTruthy();
    expect(screen.getByText('Compare with care')).toBeTruthy();
    expect(screen.getAllByTestId('compare-maxDrawdown')).toHaveLength(2);
    expect(screen.getByText('Simulated data')).toBeTruthy();
  });

  it('shows period-block runs as blocks and warns about runs from another engine version', async () => {
    const a = await savedRun();
    const b = await savedRun('sim-eurusd', '10000', { kind: 'walk_forward', folds: 4 });
    const row = await harness.db.getFirstAsync<{ result: string }>('SELECT result FROM backtest_run WHERE id = ?', [a.run.id]);
    await harness.db.runAsync('UPDATE backtest_run SET result = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(row!.result), engineVersion: 1 }), a.run.id]);
    searchParams.current = { ids: `${a.run.id},${b.run.id}` };
    await renderWith(<CompareScreen />);
    expect(await screen.findByTestId('comparison')).toBeTruthy();
    const oos = screen.getAllByTestId('compare-oos').map((n) => n.props.children);
    expect(oos[0]).toMatch(/^Run 1: \d+ trades/);
    expect(oos[1]).toBe('Run 2: Period blocks (4)');
    expect(screen.queryByText(/no holdout split/)).toBeNull();
    expect(screen.getByText(/different versions of the backtest engine/)).toBeTruthy();
  });
});

describe('Result report (Phase 9 review)', () => {
  it('names period blocks, explains hindsight regimes, and flags runs from an older engine', async () => {
    const { run } = await savedRun('sim-eurusd', '10000', { kind: 'walk_forward', folds: 3 });
    const row = await harness.db.getFirstAsync<{ result: string }>('SELECT result FROM backtest_run WHERE id = ?', [run.id]);
    await harness.db.runAsync('UPDATE backtest_run SET result = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(row!.result), engineVersion: 1 }), run.id]);
    searchParams.current = { id: run.id };
    await renderWith(<ResultScreen />);
    expect(await screen.findByText('Period blocks (no refitting)')).toBeTruthy();
    expect(screen.getAllByTestId('split-row')).toHaveLength(3);
    expect(screen.getByText(/labels are assigned with hindsight/)).toBeTruthy();
    expect(screen.getByText('Older run')).toBeTruthy();
    expect(screen.queryByText(/Walk-forward/)).toBeNull();
  });

  it('offers period blocks, not walk-forward, on the run screen', async () => {
    const v = await savedStrategy();
    searchParams.current = { strategyId: v.strategyId };
    await renderWith(<RunScreen />);
    expect(await screen.findByText('Period blocks')).toBeTruthy();
    expect(screen.queryByText(/Walk-forward/)).toBeNull();
  });
});

describe('Playbook', () => {
  it('saves the hypothesis linked to a run and shows the rules and version history', async () => {
    const { version, run } = await savedRun();
    searchParams.current = { id: version.strategyId };
    await renderWith(<PlaybookScreen />);
    expect(await screen.findByText(/Entry, exit, risk and sizing/)).toBeTruthy();
    expect(screen.getAllByTestId('playbook-version')).toHaveLength(1);
    await press('Save playbook');
    expect(await screen.findByText(/Write the hypothesis/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('playbook-hypothesis'), 'Trends continue more often than they reverse');
    await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`seed ${run.inputs.dataset.seed}`) }));
    expect(await screen.findAllByTestId('playbook-split')).toHaveLength(2);
    await press('Save playbook');
    expect(await screen.findByText('Playbook saved.')).toBeTruthy();
    const pb = await harness.container.backtests.playbook(version.strategyId);
    expect(pb.ok && pb.value?.runId).toBe(run.id);
  });
});

describe('Portfolio', () => {
  it('shows an empty state without paper accounts, and links the sandbox', async () => {
    await renderWith(<PortfolioScreen />);
    expect(await screen.findByText('No paper accounts yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-sandbox'));
    expect(router.push).toHaveBeenCalledWith('/portfolio/sandbox');
  });

  it('the sandbox compares a basket with single picks and states its assumptions', async () => {
    await renderWith(<SandboxScreen />);
    expect(await screen.findByTestId('sandbox-beat')).toBeTruthy();
    expect(screen.getByText(/No dividends, fees, taxes or inflation/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('sandbox-seed'), 'x');
    expect(await screen.findByText('Use a whole number')).toBeTruthy();
  });
});
