import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { backtestSetup, runBacktestSliced, runInputs, defaultRunForm, templateFor } from '../../features/backtest';
import { pickAndCheckCsv, saveImport } from '../../features/marketData';
import { shownError } from '../../shared/errors';
import { err } from '../../shared/result';
import type { UtcIso } from '../../shared/time';
import { hourlyCsv } from '../../testing/csvFixtures';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { createTestHarness, TestProviders, TEST_NOW, type TestHarness } from '../../testing/testContainer';
import ServicesScreen from '../(tabs)/more/services';
import MoreScreen from '../(tabs)/more/index';
import ChartLabScreen from '../(tabs)/practice/chart-lab';
import ReplayScreen from '../(tabs)/practice/replay';
import RunScreen from '../backtest/run';
import CalendarEventScreen from '../calendar/[id]';
import CalendarScreen from '../calendar/index';
import CoachScreen from '../coach';
import DatasetScreen from '../data/[id]';
import ImportScreen from '../data/import';
import DataScreen from '../data/index';
import NewsScreen from '../news';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

const NOW = TEST_NOW as UtcIso;
const KEY = 'sk-ant-0123456789abcdef';
let h: TestHarness;
beforeEach(async () => {
  h = await createTestHarness();
  resetRouterMock();
  searchParams.current = {};
});
afterEach(() => h.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={h.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const lastCall = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1]?.[0] as { pathname: string; params: Record<string, string> };

async function integrations(patch: Record<string, unknown>) {
  const s = await h.container.settings.get();
  if (!s.ok) throw new Error(s.error.message);
  const r = await h.container.settings.update({ integrations: { ...s.value.integrations, ...patch } }, NOW);
  if (!r.ok) throw new Error(r.error.message);
}

async function imported(count = 400) {
  h.datasetFiles.nextCsv = { name: 'eurusd-h1.csv', text: hourlyCsv(count) };
  const picked = await pickAndCheckCsv(h.container);
  if (!picked.ok || !picked.value) throw new Error('pick');
  const saved = await saveImport(h.container, picked.value, { symbol: 'EURUSD', name: 'Euro', market: 'forex', currency: 'USD', utcOffset: '+00:00' });
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

describe('Data and AI services (spec §24.3, §34)', () => {
  it('shows everything off, saves a key without showing it, and deletes it', async () => {
    await renderWith(<ServicesScreen />);
    expect(await screen.findByTestId('services-screen')).toBeTruthy();
    expect(screen.getByText(/off until you turn them on/)).toBeTruthy();
    const input = screen.getByTestId('key-input-anthropic_api_key');
    expect(input.props.secureTextEntry).toBe(true);
    await fireEvent.changeText(input, KEY);
    const saves = await screen.findAllByRole('button', { name: 'Save key' });
    await fireEvent.press(saves[1] as never);
    expect(await screen.findByTestId('key-saved-anthropic_api_key')).toBeTruthy();
    expect(screen.queryByText(new RegExp(KEY))).toBeNull();
    expect(h.secrets.values.get('anthropic_api_key')).toBe(KEY);
    await press(/^Delete Anthropic/);
    await waitFor(() => expect(h.secrets.values.size).toBe(0));
  });

  it('refuses to turn on Twelve Data without a key, and shows the Anthropic notice in cloud mode', async () => {
    await renderWith(<ServicesScreen />);
    await fireEvent.press((await screen.findAllByRole('radio', { name: 'On' }))[0] as never);
    expect(await screen.findByTestId('services-error-marketProvider')).toBeTruthy();
    await h.container.secrets.set('anthropic_api_key', KEY);
    await integrations({ coach: 'cloud' });
    expect(await screen.findByText('What is sent to Anthropic')).toBeTruthy();
  });

  it('lists the new tools on the More tab', async () => {
    await renderWith(<MoreScreen />);
    for (const id of ['coach', 'calendar', 'newsToLearning', 'marketData', 'services']) expect(await screen.findByTestId(`more-${id}`)).toBeTruthy();
  });
});

describe('Your price data (spec §30)', () => {
  it('imports a file: quality report, details, save, and its "Imported:" label', async () => {
    h.datasetFiles.nextCsv = { name: 'eurusd-h1.csv', text: hourlyCsv(120) };
    await renderWith(<ImportScreen />);
    await press('Choose a CSV file');
    expect(await screen.findByTestId('quality-status')).toHaveProperty('props.children', 'Passed the checks, with notes');
    await fireEvent.changeText(screen.getByTestId('import-symbol'), 'EURUSD');
    await press(/^Save as “Imported: eurusd-h1.csv”/);
    await waitFor(() => expect(lastCall(router.replace).pathname).toBe('/data/[id]'));
    const list = await h.container.marketData.list();
    expect(list.ok && list.value[0]?.fileName).toBe('eurusd-h1.csv');
  });

  it('shows a refused file’s errors and offers another file', async () => {
    h.datasetFiles.nextCsv = { name: 'bad.csv', text: 'when,price\n1,2' };
    await renderWith(<ImportScreen />);
    await press('Choose a CSV file');
    expect(await screen.findByText('Refused: the data failed the checks')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeTruthy();
  });

  it('lists saved data, opens it, and offers Chart Lab and replay', async () => {
    const d = await imported();
    const list = await renderWith(<DataScreen />);
    await fireEvent.press(await screen.findByTestId(`dataset-${d.id}`));
    expect(lastCall(router.push).params.id).toBe(d.id);
    searchParams.current = { id: d.id };
    await list.unmount();
    await renderWith(<DatasetScreen />);
    expect(await screen.findByTestId('dataset-label')).toHaveProperty('props.children', 'Imported: eurusd-h1.csv');
    await press('Open in Chart Lab');
    expect(lastCall(router.push)).toEqual({ pathname: '/practice/chart-lab', params: { datasetId: d.id } });
  });

  it('fetches from the provider only when turned on, and shows a plain error', async () => {
    const off = await renderWith(<DataScreen />);
    expect(await screen.findByText(/It is off now/)).toBeTruthy();
    await off.unmount();
    await h.container.secrets.set('twelvedata_api_key', 'td-key-0123456789');
    await integrations({ marketProvider: true });
    h.provider.next = err(shownError('ProviderUnavailable', 'Twelve Data is not answering properly right now. Try again later.'));
    await renderWith(<DataScreen />);
    await fireEvent.changeText(await screen.findByTestId('fetch-symbol'), 'EUR/USD');
    await press('Fetch data');
    expect(await screen.findByTestId('fetch-error')).toHaveProperty('props.children', 'Twelve Data is not answering properly right now. Try again later.');
  });

  it('charts imported candles in Chart Lab with their label instead of the simulated notice', async () => {
    const d = await imported();
    searchParams.current = { datasetId: d.id };
    await renderWith(<ChartLabScreen />);
    expect(await screen.findByText('Imported: eurusd-h1.csv')).toBeTruthy();
    expect(screen.queryByTestId('simulated-label')).toBeNull();
    expect(screen.getByText(/Candles 161–400 of 400, H1/)).toBeTruthy();
    await press('Earlier candles');
    expect(await screen.findByText(/Candles 41–280 of 400/)).toBeTruthy();
  });

  it('replays imported forex data, reviewed but not saved', async () => {
    const d = await imported();
    searchParams.current = { datasetId: d.id };
    await renderWith(<ReplayScreen />);
    await press('Start replay');
    expect(await screen.findByTestId('real-data-label')).toBeTruthy();
    await press('Finish and review');
    expect(await screen.findByText(/Reviewed, not saved/)).toBeTruthy();
    const attempts = await h.db.getAllAsync('SELECT * FROM replay_attempt', []);
    expect(attempts).toHaveLength(0);
  });

  it('offers matching data on the backtest run screen, and a run on it is labelled with its source', async () => {
    const d = await imported(400);
    const trend = templateFor('trend-following-moving-averages');
    if (!trend) throw new Error('template');
    const definition = { ...trend.definition, instrumentId: 'sim-eurusd', timeframe: 'H1' as const };
    const v = await h.container.backtests.saveVersion({ strategyId: null, name: 'Trend', definition, templateId: trend.strategyId, note: '' }, NOW);
    if (!v.ok) throw new Error(v.error.message);
    searchParams.current = { strategyId: v.value.strategyId };
    await renderWith(<RunScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Imported: eurusd-h1.csv' }));
    expect(await screen.findByText(/Real past prices: 400 H1 candles/)).toBeTruthy();
    expect(screen.queryByTestId('run-seed')).toBeNull();
    const inputs = runInputs(v.value.definition, { ...defaultRunForm(v.value.definition), datasetId: d.id, costsConfirmed: true }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 }, { id: d.id, candleCount: d.candleCount, contentHash: d.contentHash, label: 'Imported: eurusd-h1.csv' });
    if (!inputs.ok) throw new Error(JSON.stringify(inputs.error));
    const ds = await h.container.datasets.load(inputs.value.dataset);
    if (!ds.ok) throw new Error(ds.error.message);
    const setup = backtestSetup(v.value.definition, inputs.value, ds.value);
    if (!setup.ok) throw new Error(setup.error.message);
    const r = await runBacktestSliced(setup.value, { yieldToLoop: async () => undefined });
    expect(r.ok && r.value.kind === 'done' && r.value.result.dataLabel).toBe('Imported: eurusd-h1.csv');
    expect(r.ok && r.value.kind === 'done' && r.value.result.conventions.join(' ')).not.toMatch(/simulated candles|not applicable here/);
    expect(r.ok && r.value.kind === 'done' && r.value.result.conventions[0]).toMatch(/^Data: real past prices/);
  });
});

describe('Calendar and News to Learning (spec §25)', () => {
  it('shows the fictional sample week with its notice, and opens an explainer', async () => {
    const list = await renderWith(<CalendarScreen />);
    expect(await screen.findByText(/Sample events only/)).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('event-type-ce-inflation'));
    expect(lastCall(router.push).params.id).toBe('ce-inflation');
    await list.unmount();
    searchParams.current = { id: 'ce-inflation' };
    await renderWith(<CalendarEventScreen />);
    expect(await screen.findByText('What it cannot tell you')).toBeTruthy();
    expect(screen.getByText('Study next')).toBeTruthy();
  });

  it('turns a headline into the five questions, and offers fictional scenarios with none', async () => {
    await renderWith(<NewsScreen />);
    expect(await screen.findByText('No headline? Practise with a fictional one')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('headline-input'), 'Inflation rises to 3.2%, above forecasts');
    await press('Make study questions');
    for (const id of ['measure', 'rates', 'assets', 'expected', 'reaction']) expect(await screen.findByTestId(`question-${id}`)).toBeTruthy();
    expect(screen.getByText(/Numbers to compare with what was expected: 3.2%/)).toBeTruthy();
  });
});

describe('Coach screen (spec §24)', () => {
  it('is off by default and points to the settings', async () => {
    await renderWith(<CoachScreen />);
    expect(await screen.findByText('The coach is off')).toBeTruthy();
  });

  it('answers offline, labelled as the app’s own lessons', async () => {
    await integrations({ coach: 'curated' });
    await renderWith(<CoachScreen />);
    await fireEvent.changeText(await screen.findByTestId('coach-term'), 'spread');
    await press('Ask');
    expect(await screen.findByTestId('coach-label')).toHaveProperty('props.children', 'From the app’s own lessons (not AI)');
    expect(h.cloudCoach.requests).toHaveLength(0);
  });

  it('labels cloud answers "AI suggestion", and falls back with the reason when the call fails', async () => {
    await h.container.secrets.set('anthropic_api_key', KEY);
    await integrations({ coach: 'cloud' });
    await renderWith(<CoachScreen />);
    expect(await screen.findByText('Cloud coach: sent to Anthropic')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('coach-term'), 'spread');
    await press('Ask');
    expect(await screen.findByTestId('coach-label')).toHaveProperty('props.children', 'AI suggestion');
    h.cloudCoach.next = err(shownError('ProviderUnavailable', 'Could not reach Anthropic. Check your connection.'));
    await press('Ask');
    expect(await screen.findByTestId('coach-fallback')).toHaveProperty('props.children', expect.stringMatching(/Could not reach Anthropic/));
    expect(screen.getByTestId('coach-label').props.children).toBe('From the app’s own lessons (not AI)');
  });
});
