import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { templateFor } from '../../features/backtest';
import { pickAndCheckCsv, saveImport } from '../../features/marketData';
import type { UtcIso } from '../../shared/time';
import { hourlyCsv } from '../../testing/csvFixtures';
import { resetRouterMock, searchParams } from '../../testing/routerMock';
import { createTestHarness, TestProviders, TEST_NOW, type TestHarness } from '../../testing/testContainer';
import BackupScreen from '../(tabs)/more/backup';
import ServicesScreen from '../(tabs)/more/services';
import ChartLabScreen from '../(tabs)/practice/chart-lab';
import ReplayScreen from '../(tabs)/practice/replay';
import RunScreen from '../backtest/run';
import ImportScreen from '../data/import';

/** Screen behaviour for the Phase 11 review findings (B, D, E, F, H, J). */

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

const NOW = TEST_NOW as UtcIso;
let h: TestHarness;
beforeEach(async () => {
  h = await createTestHarness();
  resetRouterMock();
  searchParams.current = {};
});
afterEach(() => h.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={h.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

/** Hourly candles around `price` (no zone). */
function csvAround(price: number, count = 400): string {
  const rows = Array.from({ length: count }, (_, i) => {
    const t = new Date(Date.UTC(2024, 0, 1) + i * 3_600_000).toISOString().replace('T', ' ').slice(0, 16);
    const p = price + i * 0.01;
    return [t, p.toFixed(3), (p + 0.05).toFixed(3), (p - 0.05).toFixed(3), (p + 0.01).toFixed(3), '100'].join(',');
  });
  return ['date,open,high,low,close,volume', ...rows].join('\n');
}

async function imported(text: string, name = 'eurusd-h1.csv') {
  h.datasetFiles.nextCsv = { name, text };
  const picked = await pickAndCheckCsv(h.container);
  if (!picked.ok || !picked.value) throw new Error('pick');
  const saved = await saveImport(h.container, picked.value, { symbol: 'X', name: 'X', market: 'forex', currency: 'USD', utcOffset: '+00:00' });
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

async function strategyOnEurusd() {
  const trend = templateFor('trend-following-moving-averages');
  if (!trend) throw new Error('template');
  const definition = { ...trend.definition, instrumentId: 'sim-eurusd', timeframe: 'H1' as const };
  const v = await h.container.backtests.saveVersion({ strategyId: null, name: 'Trend', definition, templateId: trend.strategyId, note: '' }, NOW);
  if (!v.ok) throw new Error(v.error.message);
  searchParams.current = { strategyId: v.value.strategyId };
}

describe('Backtest run setup on real data (B, E)', () => {
  it('needs the costs confirmed before a run on real data', async () => {
    await imported(hourlyCsv(400));
    await strategyOnEurusd();
    await renderWith(<RunScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Imported: eurusd-h1.csv' }));
    expect(screen.queryByTestId('price-fit-warning')).toBeNull();
    await press('Run backtest');
    expect(await screen.findByTestId('costs-confirm-issue')).toBeTruthy();
    expect(await h.db.getAllAsync('SELECT id FROM backtest_run', [])).toHaveLength(0);
  });

  it('goes back to simulated data, with a notice, when the chosen data is deleted while the screen is open', async () => {
    const d = await imported(hourlyCsv(400));
    await strategyOnEurusd();
    await renderWith(<RunScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Imported: eurusd-h1.csv' }));
    expect(screen.queryByTestId('run-seed')).toBeNull();
    await h.container.marketData.delete(d.id);
    expect(await screen.findByText('Back to simulated data')).toBeTruthy();
    expect(await screen.findByTestId('run-seed')).toBeTruthy();
  });

  it('warns when the data’s price level does not fit the practice market, and pre-fills scaled costs', async () => {
    await imported(csvAround(150), 'usdjpy-h1.csv');
    await strategyOnEurusd();
    await renderWith(<RunScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Imported: usdjpy-h1.csv' }));
    const warning = await screen.findByTestId('price-fit-warning');
    expect(warning.props.children).toMatch(/Rough estimate — check your broker/);
    await waitFor(() => expect(Number(screen.getByTestId('run-spread').props.value)).toBeGreaterThan(0.001));
  });

  it('shows the same warning in replay on real data', async () => {
    const d = await imported(csvAround(150), 'usdjpy-h1.csv');
    searchParams.current = { datasetId: d.id };
    await renderWith(<ReplayScreen />);
    expect(await screen.findByTestId('price-fit-warning')).toBeTruthy();
  });
});

describe('Links to missing data (J, L7)', () => {
  it('Chart Lab and replay say the data is not on this device and show simulated data', async () => {
    searchParams.current = { datasetId: 'ds_gone' };
    const lab = await renderWith(<ChartLabScreen />);
    expect(await screen.findByText('That price data is not on this device')).toBeTruthy();
    await lab.unmount();
    await renderWith(<ReplayScreen />);
    expect(await screen.findByText('That price data is not on this device')).toBeTruthy();
  });
});

describe('CSV import offset (D)', () => {
  it('asks for a UTC offset with a hint, and applies it to the report', async () => {
    h.datasetFiles.nextCsv = { name: 'mt.csv', text: hourlyCsv(300) };
    await renderWith(<ImportScreen />);
    await press('Choose a CSV file');
    const field = await screen.findByTestId('import-offset');
    expect(field.props.value).toBe('+00:00');
    expect(field.props.accessibilityHint).toMatch(/two hours ahead of UTC/);
    await fireEvent.changeText(field, '+02:00');
    expect(await screen.findByText(/read as UTC\+02:00/)).toBeTruthy();
  });
});

describe('Services copy and keys (F, G, J)', () => {
  it('shows the plan notice and the billing note, and offers no "free" wording', async () => {
    await renderWith(<ServicesScreen />);
    expect(await screen.findByTestId('td-plan-notice')).toBeTruthy();
    expect(screen.getByText(/billed to your Anthropic account/)).toBeTruthy();
    expect(screen.queryByText(/free or paid/)).toBeNull();
  });

  it('keeps the pasted key when saving it fails', async () => {
    await renderWith(<ServicesScreen />);
    const input = await screen.findByTestId('key-input-twelvedata_api_key');
    h.secrets.failing = true;
    await fireEvent.changeText(input, 'td-secret-key-0123456789');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Save key' })[0]!);
    expect(await screen.findByTestId('services-error-twelvedata_api_key')).toBeTruthy();
    expect(screen.getByTestId('key-input-twelvedata_api_key').props.value).toBe('td-secret-key-0123456789');
  });
});

describe('Restore resets online services (H)', () => {
  it('turns services and consent off after restoring a backup that had them on, and says so', async () => {
    await h.container.secrets.set('anthropic_api_key', 'sk-ant-0123456789abcdef');
    await h.container.secrets.set('twelvedata_api_key', 'td-secret-key-0123456789');
    const s = await h.container.settings.get();
    if (!s.ok) throw new Error(s.error.message);
    // A backup from a phone with everything allowed (or a crafted file granting consent).
    await h.container.settings.update({ integrations: { marketProvider: true, coach: 'cloud', cloudModel: 'claude-opus-5-5', coachConsent: { journal: true, strategies: true, backtests: true } } }, NOW);
    const prepared = await h.container.backup.prepare(NOW);
    if (!prepared.ok) throw new Error(prepared.error.message);
    expect(prepared.value.text).toMatch(/\\"coach\\":\\"cloud\\"/);
    h.files.nextPick = prepared.value.text;
    await renderWith(<BackupScreen />);
    await press('Choose backup file');
    await press('Replace my data');
    expect(await screen.findByTestId('restore-services-reset')).toBeTruthy();
    const after = await h.container.settings.get();
    expect(after.ok && after.value.integrations).toEqual({ marketProvider: false, coach: 'off', cloudModel: 'claude-haiku-5-5', coachConsent: { journal: false, strategies: false, backtests: false } });
  });
});
