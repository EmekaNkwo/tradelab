import { ok } from '../../../shared/result';
import { providerRows } from '../../../testing/fakeOnline';
import { createTestHarness, movableClock, TEST_NOW, type TestHarness } from '../../../testing/harness';

/** Review finding A: provider data rows are versions that are never changed in place. */

const TD_KEY = 'td-secret-key-0123456789';
const REQ = { symbol: 'EUR/USD', name: 'Euro', market: 'forex' as const, timeframe: 'H1' as const, candles: 200 };
const series = (start: number) => ok({ symbol: 'EUR/USD', currency: 'USD', exchange: null, exchangeTimeZone: null, instrumentType: null, rowsTimeZone: 'UTC' as const, rows: providerRows(200, start) });
const START_A = Date.UTC(2024, 0, 1);
const START_B = Date.UTC(2024, 2, 1);

let h: TestHarness;
let clock: ReturnType<typeof movableClock>;
beforeEach(async () => {
  clock = movableClock(TEST_NOW);
  h = await createTestHarness(undefined, clock);
  await h.container.secrets.set('twelvedata_api_key', TD_KEY);
  const s = await h.container.settings.get();
  if (!s.ok) throw new Error(s.error.message);
  await h.container.settings.update({ integrations: { ...s.value.integrations, marketProvider: true } }, TEST_NOW as never);
});
afterEach(() => h.db.close());

async function fetchAs(start: number, refresh = false, req: typeof REQ | (Omit<typeof REQ, 'market'> & { market: 'commodities' }) = REQ) {
  h.provider.next = series(start);
  const r = await h.container.providerData.getSeries({ ...req, refresh });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** Records a saved backtest run that used this data set (only the inputs matter here). */
async function runUsing(datasetId: string) {
  await h.db.runAsync('PRAGMA foreign_keys = OFF', []);
  await h.db.runAsync('INSERT INTO backtest_run (id, strategy_id, version, inputs, input_hash, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [`run_${datasetId}`, 'st_1', 1, JSON.stringify({ dataset: { datasetId } }), 'h', '{}', TEST_NOW]);
  await h.db.runAsync('PRAGMA foreign_keys = ON', []);
}

const providerIds = async () => (await h.db.getAllAsync<{ id: string }>('SELECT id FROM provider_dataset ORDER BY created_at', [])).map((r) => r.id);

describe('provider data versions (A)', () => {
  it('a refetch saves a new row; an old row no run uses is pruned', async () => {
    const first = await fetchAs(START_A);
    clock.set('2026-10-30T12:00:00.000Z');
    const second = await fetchAs(START_B, true);
    expect(second.fromCache).toBe(false);
    expect(second.dataset.id).not.toBe(first.dataset.id);
    expect(await providerIds()).toEqual([second.dataset.id]);
  });

  it('keeps an old row that a saved run still uses, unchanged, so the run can be repeated', async () => {
    const first = await fetchAs(START_A);
    await runUsing(first.dataset.id);
    const before = await h.container.marketData.get(first.dataset.id);
    clock.set('2026-10-30T12:00:00.000Z');
    const second = await fetchAs(START_B, true);
    expect(await providerIds()).toEqual([first.dataset.id, second.dataset.id]);
    const after = await h.container.marketData.get(first.dataset.id);
    expect(after.ok && after.value?.contentHash).toBe(before.ok && before.value?.contentHash);
  });

  it('the cache serves the newest row for the request, and says when it was fetched', async () => {
    const first = await fetchAs(START_A);
    await runUsing(first.dataset.id);
    clock.set('2026-10-30T12:00:00.000Z');
    const second = await fetchAs(START_B, true);
    clock.set('2026-10-30T13:00:00.000Z');
    const cached = await h.container.providerData.getSeries(REQ);
    expect(cached.ok && cached.value).toMatchObject({ fromCache: true, fetchedAt: '2026-10-30T12:00:00.000Z', dataset: { id: second.dataset.id } });
  });

  it('keys the cache on the market too, so the same symbol as another market is fetched again', async () => {
    await fetchAs(START_A);
    await fetchAs(START_A, false, { ...REQ, market: 'commodities' });
    expect(h.provider.requests).toHaveLength(2);
  });

  it('a rerun refuses a data set whose content differs from what the run used', async () => {
    const first = await fetchAs(START_A);
    const stored = await h.container.marketData.get(first.dataset.id);
    if (!stored.ok || !stored.value) throw new Error('missing');
    const spec = { instrumentId: 'sim-eurusd', timeframe: 'H1' as const, seed: 0, candles: 200, datasetId: first.dataset.id, contentHash: stored.value.contentHash, dataLabel: 'Historical · Twelve Data · EUR/USD' };
    const same = await h.container.datasets.load(spec);
    expect(same.ok && same.value.spec).toMatchObject({ contentHash: stored.value.contentHash, dataLabel: spec.dataLabel });
    const other = await h.container.datasets.load({ ...spec, contentHash: 'f'.repeat(64) });
    expect(!other.ok && other.error.message).toMatch(/not the one the run used/);
  });

  it('a run whose data is gone says so, naming the data it used', async () => {
    const spec = { instrumentId: 'sim-eurusd', timeframe: 'H1' as const, seed: 0, candles: 200, datasetId: 'pd_gone', dataLabel: 'Historical · Twelve Data · EUR/USD' };
    const r = await h.container.datasets.load(spec);
    expect(!r.ok && r.error.learnerText).toBe('The data this run used is no longer on this device (was: Historical · Twelve Data · EUR/USD), so the run cannot be repeated.');
  });

  it('adds a local-date note to daily data, and keeps the currency only when it is a 3-letter code', async () => {
    h.provider.next = ok({ symbol: 'AAPL', currency: 'US Dollar', exchange: 'NASDAQ', exchangeTimeZone: 'America/New_York', instrumentType: null, rowsTimeZone: 'UTC' as const, rows: providerRows(200, START_A).map((r, i) => ({ ...r, datetime: new Date(START_A + i * 86_400_000).toISOString().slice(0, 10) })) });
    const r = await h.container.providerData.getSeries({ ...REQ, symbol: 'AAPL', market: 'stocks', timeframe: 'D1' });
    if (!r.ok) throw new Error(r.error.message);
    const stored = await h.container.marketData.get(r.value.dataset.id);
    expect(stored.ok && stored.value?.currency).toBeNull();
    expect(stored.ok && stored.value?.quality.warnings.join(' ')).toMatch(/local/i);
  });
});
