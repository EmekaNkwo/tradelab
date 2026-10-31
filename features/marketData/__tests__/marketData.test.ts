import { parseOhlcvCsv } from '../../../domain/marketData/csvImport';
import { recheck, saveImport, pickAndCheckCsv } from '..';
import { deleteSecret, saveSecret, secretsStatus, updateIntegrations } from '../../services/secrets';
import { logger } from '../../../shared/logger';
import { ok } from '../../../shared/result';
import { hourlyCsv } from '../../../testing/csvFixtures';
import { providerRows } from '../../../testing/fakeOnline';
import { createTestHarness, movableClock, TEST_NOW, type TestHarness } from '../../../testing/harness';
import { createRateLimiter, requestKey } from '../../../data';

const DETAILS = { symbol: 'EURUSD', name: 'Euro / US dollar', market: 'forex', currency: 'USD', utcOffset: '+00:00' } as const;
const TD_KEY = 'td-secret-key-0123456789';

let h: TestHarness;
beforeEach(async () => {
  h = await createTestHarness(undefined, movableClock(TEST_NOW));
});
afterEach(() => h.db.close());

async function importCsv(count = 300) {
  h.datasetFiles.nextCsv = { name: 'eurusd-h1.csv', text: hourlyCsv(count) };
  const picked = await pickAndCheckCsv(h.container);
  if (!picked.ok || !picked.value) throw new Error('no file');
  const saved = await saveImport(h.container, picked.value, DETAILS);
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

describe('Imported data (spec §30)', () => {
  it('saves a checked file, labels it with its file name, and loads it back intact', async () => {
    const d = await importCsv();
    expect(d).toMatchObject({ origin: 'user_import', fileName: 'eurusd-h1.csv', candleCount: 300, timeframe: 'H1', contractInstrumentId: 'sim-eurusd' });
    const back = await h.container.marketData.get(d.id);
    expect(back.ok && back.value?.candles).toHaveLength(300);
    expect(back.ok && back.value?.candles[0]?.close.toString()).toBe('1.1001');
  });

  it('applies the chosen UTC offset to zone-less times and records it (D)', async () => {
    h.datasetFiles.nextCsv = { name: 'eurusd-h1.csv', text: hourlyCsv(300) };
    const picked = await pickAndCheckCsv(h.container);
    if (!picked.ok || !picked.value) throw new Error('no file');
    expect(picked.value.result.candles[0]?.time).toBe('2024-01-01T00:00:00.000Z');
    const shifted = recheck(h.container, picked.value, '+02:00');
    expect(shifted.result.candles[0]?.time).toBe('2023-12-31T22:00:00.000Z');
    expect(recheck(h.container, picked.value, 'nonsense')).toBe(picked.value);
    expect((await saveImport(h.container, picked.value, { ...DETAILS, utcOffset: 'UTC+2' })).ok).toBe(false);
    // Saving re-reads with the offset given, even if the screen showed an older reading.
    const saved = await saveImport(h.container, picked.value, { ...DETAILS, utcOffset: '-05:00' });
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.value.timeZone).toBe('UTC-05:00');
    expect(saved.value.first).toBe('2024-01-01T05:00:00.000Z');
  });

  it('never saves a refused file', async () => {
    h.datasetFiles.nextCsv = { name: 'bad.csv', text: 'date,price\n1,2' };
    const picked = await pickAndCheckCsv(h.container);
    expect(picked.ok && picked.value?.result.report.status).toBe('refused');
    if (!picked.ok || !picked.value) return;
    expect((await saveImport(h.container, picked.value, DETAILS)).ok).toBe(false);
    expect((await h.container.marketData.list()).ok && (await h.container.marketData.list())).toMatchObject({ value: [] });
  });

  it('refuses tampered candles on load', async () => {
    const d = await importCsv();
    await h.db.runAsync(`UPDATE imported_dataset SET candles = replace(candles, '1.1001', '1.2001') WHERE id = ?`, [d.id]);
    expect((await h.container.marketData.get(d.id)).ok).toBe(false);
  });

  it('feeds backtests only when market and timeframe match, labelled with the source, and fails once deleted', async () => {
    const d = await importCsv();
    const spec = { instrumentId: 'sim-eurusd', timeframe: 'H1' as const, seed: 0, candles: 300, datasetId: d.id };
    const loaded = await h.container.datasets.load(spec);
    expect(loaded.ok && loaded.value.label).toBe('Imported: eurusd-h1.csv');
    expect(loaded.ok && loaded.value.candles).toHaveLength(300);
    expect((await h.container.datasets.load({ ...spec, timeframe: 'D1' })).ok).toBe(false);
    expect((await h.container.datasets.load({ ...spec, instrumentId: 'sim-gold' })).ok).toBe(false);
    await h.container.marketData.delete(d.id);
    const gone = await h.container.datasets.load(spec);
    expect(!gone.ok && gone.error.learnerText).toMatch(/no longer on this device/);
  });

  it('is in backups (with its checksum checked on restore); provider data and keys are not', async () => {
    const d = await importCsv();
    await h.container.secrets.set('twelvedata_api_key', TD_KEY);
    h.provider.next = ok({ symbol: 'EUR/USD', currency: 'USD', exchange: null, exchangeTimeZone: null, instrumentType: null, rowsTimeZone: 'UTC', rows: providerRows(200) });
    await h.container.settings.update({ integrations: { ...(await settings()).integrations, marketProvider: true } }, TEST_NOW as never);
    expect((await h.container.providerData.getSeries({ symbol: 'EUR/USD', name: '', market: 'forex', timeframe: 'H1', candles: 200 })).ok).toBe(true);
    const prepared = await h.container.backup.prepare(TEST_NOW as never);
    if (!prepared.ok) throw new Error(prepared.error.message);
    expect(prepared.value.text).toContain(d.id);
    expect(prepared.value.text).not.toContain('provider_dataset');
    expect(prepared.value.text).not.toContain(TD_KEY);
    expect(prepared.value.text).not.toMatch(/api_key|apikey/i);
    const parsed = h.container.backup.parse(prepared.value.text);
    expect(parsed.ok).toBe(true);
    const tampered = h.container.backup.parse(prepared.value.text.replace(/"content_hash":"[0-9a-f]{8}/, '"content_hash":"00000000'));
    if (!tampered.ok) throw new Error(tampered.error.message);
    expect((await h.container.backup.restore(tampered.value.file)).ok).toBe(false);
    if (!parsed.ok) return;
    expect((await h.container.backup.restore(parsed.value.file)).ok).toBe(true);
    const restored = await h.container.marketData.get(d.id);
    expect(restored.ok && restored.value?.candleCount).toBe(300);
  });
});

async function settings() {
  const s = await h.container.settings.get();
  if (!s.ok) throw new Error(s.error.message);
  return s.value;
}

describe('Historical provider data (spec §30)', () => {
  const REQ = { symbol: 'eur/usd', name: 'Euro', market: 'forex' as const, timeframe: 'H1' as const, candles: 200 };
  const series = (rows = providerRows(200)) => ok({ symbol: 'EUR/USD', currency: 'USD', exchange: null, exchangeTimeZone: null, instrumentType: null, rowsTimeZone: 'UTC' as const, rows });

  const turnOn = async () => h.container.settings.update({ integrations: { ...(await settings()).integrations, marketProvider: true } }, TEST_NOW as never);

  it('is refused while switched off, even when called directly', async () => {
    await h.container.secrets.set('twelvedata_api_key', TD_KEY);
    const off = await h.container.providerData.getSeries(REQ);
    expect(!off.ok && off.error.message).toMatch(/turned off/);
    expect(h.provider.requests).toHaveLength(0);
  });

  it('needs a saved key, checks the rows strictly, labels them Historical and caches them', async () => {
    await turnOn();
    const missing = await h.container.providerData.getSeries(REQ);
    expect(!missing.ok && missing.error.message).toMatch(/key/i);
    expect(h.provider.requests).toHaveLength(0);
    await h.container.secrets.set('twelvedata_api_key', TD_KEY);
    h.provider.next = series();
    const first = await h.container.providerData.getSeries(REQ);
    expect(first.ok && first.value.fromCache).toBe(false);
    expect(first.ok && first.value.dataset).toMatchObject({ origin: 'historical', sourceName: 'Twelve Data', symbol: 'EUR/USD', candleCount: 200 });
    expect(h.provider.requests[0]).toMatchObject({ apiKey: TD_KEY, timeframe: 'H1', candles: 200 });
    const again = await h.container.providerData.getSeries(REQ);
    expect(again.ok && again.value.fromCache).toBe(true);
    expect(h.provider.requests).toHaveLength(1);
  });

  it('refuses bad provider rows and never saves them', async () => {
    await turnOn();
    await h.container.secrets.set('twelvedata_api_key', TD_KEY);
    const rows = providerRows(200).map((r, i) => (i === 10 ? { ...r, high: '0.5' } : r));
    h.provider.next = series(rows);
    const r = await h.container.providerData.getSeries(REQ);
    expect(!r.ok && r.error.kind).toBe('DataQualityError');
    expect((await h.container.marketData.list()).ok && (await h.container.marketData.list())).toMatchObject({ value: [] });
  });

  it('limits requests per minute and per day', () => {
    let t = 0;
    const limiter = createRateLimiter(2, 3, () => t);
    limiter.record();
    limiter.record();
    expect(limiter.check()).toMatch(/2 requests a minute/);
    t = 61_000;
    expect(limiter.check()).toBeNull();
    limiter.record();
    t = 125_000;
    expect(limiter.check()).toMatch(/3 requests a day/);
    expect(requestKey('twelvedata', { symbol: ' eur/usd ', timeframe: 'H1', candles: 10, market: 'forex' })).toBe('twelvedata|EUR/USD|H1|10|forex');
  });
});

describe('Keys (spec §34)', () => {
  it('saves keys without exposing them, never logs them, and deleting turns the service off', async () => {
    logger.clear();
    expect((await saveSecret(h.container, 'anthropic_api_key', 'short')).ok).toBe(false);
    expect((await saveSecret(h.container, 'anthropic_api_key', 'sk-ant-abc123456789xyz')).ok).toBe(true);
    const status = await secretsStatus(h.container);
    expect(status.ok && status.value.saved).toEqual({ twelvedata_api_key: false, anthropic_api_key: true });
    expect(JSON.stringify(status)).not.toContain('sk-ant-abc123456789xyz');
    expect((await updateIntegrations(h.container, { marketProvider: true })).ok).toBe(false);
    expect((await updateIntegrations(h.container, { coach: 'cloud' })).ok).toBe(true);
    logger.warn('Request failed sk-ant-abc123456789xyz', { headers: { authorization: 'Bearer sk-ant-abc123456789xyz' }, detail: 'apikey sk-ant-abc123456789xyz' });
    expect(JSON.stringify(logger.entries())).not.toContain('sk-ant-abc123456789xyz');
    expect((await deleteSecret(h.container, 'anthropic_api_key')).ok).toBe(true);
    expect(h.secrets.values.size).toBe(0);
    expect((await settings()).integrations.coach).toBe('curated');
  });

  it('starts with every online service off and no consent given', async () => {
    expect((await settings()).integrations).toEqual({ marketProvider: false, coach: 'off', cloudModel: 'claude-haiku-5-5', coachConsent: { journal: false, strategies: false, backtests: false } });
    expect(parseOhlcvCsv(hourlyCsv(60), { nowMs: Date.parse(TEST_NOW) }).report.candles).toBe(60);
  });
});
