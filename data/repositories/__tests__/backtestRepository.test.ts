import { defaultCosts, runBacktest, simulatedDataset, templateFor } from '../../../domain/backtest';
import { practiceInstrument } from '../../../domain/simulation/instruments';
import { dec } from '../../../shared/decimal';
import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createSimulatedDatasetSource } from '../../market/datasetSource';
import { createBacktestRepository, storedResult } from '../backtestRepository';
import type { RunInputs } from '../backtestSchemas';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const LATER = '2026-10-29T11:00:00.000Z' as UtcIso;
let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

const TEMPLATE = templateFor('trend-following-moving-averages')!;
const DEF = { ...TEMPLATE.definition, timeframe: 'H1' as const };
const INPUTS: RunInputs = {
  dataset: { instrumentId: 'sim-eurusd', timeframe: 'H1', seed: 3, candles: 1500 },
  capital: '10000',
  costs: defaultCosts(practiceInstrument('sim-eurusd')!),
  split: { kind: 'holdout', inSamplePercent: 70 },
  versionsTried: 1,
  otherVersionsWithOutOfSample: 0,
};

function result() {
  const ds = simulatedDataset(INPUTS.dataset);
  if (!ds.ok) throw new Error(ds.error.message);
  const r = runBacktest({ definition: DEF, dataset: ds.value, capital: dec(INPUTS.capital), costs: INPUTS.costs, split: INPUTS.split });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('backtest repository', () => {
  it('saves every change as a new version and never changes an old one', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    const events: string[][] = [];
    bus.subscribe(['strategy_version'], () => events.push(['strategy_version']));
    const repo = createBacktestRepository(db, bus, newId);
    const v1 = await repo.saveVersion({ strategyId: null, name: '  My trend  ', definition: DEF, templateId: TEMPLATE.strategyId, note: '' }, NOW);
    if (!v1.ok) throw new Error(v1.error.message);
    expect(v1.value).toMatchObject({ version: 1, name: 'My trend', templateId: 'trend-following-moving-averages' });
    // Unchanged: nothing new is written.
    const same = await repo.saveVersion({ strategyId: v1.value.strategyId, name: 'My trend', definition: DEF, templateId: null, note: '' }, LATER);
    expect(same.ok && same.value.version).toBe(1);
    const v2 = await repo.saveVersion({ strategyId: v1.value.strategyId, name: 'My trend', definition: { ...DEF, riskPercent: 0.5 }, templateId: null, note: 'Lower risk' }, LATER);
    expect(v2.ok && v2.value).toMatchObject({ version: 2, note: 'Lower risk', templateId: 'trend-following-moving-averages' });
    const versions = await repo.versions(v1.value.strategyId);
    expect(versions.ok && versions.value.map((v) => [v.version, v.definition.riskPercent])).toEqual([[2, 0.5], [1, 1]]);
    const all = await repo.strategies();
    expect(all.ok && all.value.map((v) => v.version)).toEqual([2]);
    expect(events.length).toBe(2);
  });

  it('refuses invalid strategies, names and unknown ids', async () => {
    const repo = createBacktestRepository(await fresh(), createChangeBus(), newId);
    expect((await repo.saveVersion({ strategyId: null, name: '', definition: DEF, templateId: null, note: '' }, NOW)).ok).toBe(false);
    const bad = await repo.saveVersion({ strategyId: null, name: 'x', definition: { ...DEF, riskPercent: 50 }, templateId: null, note: '' }, NOW);
    expect(!bad.ok && bad.error.issues).toContain('riskPercent');
    expect((await repo.saveVersion({ strategyId: 'stg_missing', name: 'x', definition: DEF, templateId: null, note: '' }, NOW)).ok).toBe(false);
  });

  it('stores runs without trades, reads them back, and links the playbook to a run', async () => {
    const db = await fresh();
    const repo = createBacktestRepository(db, createChangeBus(), newId);
    const v = await repo.saveVersion({ strategyId: null, name: 'Trend', definition: DEF, templateId: null, note: '' }, NOW);
    if (!v.ok) throw new Error('save');
    const r = result();
    const saved = await repo.saveRun(v.value.strategyId, 1, INPUTS, r, NOW);
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.value.result.tradeCount).toBe(r.trades.length);
    expect('trades' in saved.value.result).toBe(false);
    const read = await repo.run(saved.value.id);
    expect(read.ok && read.value?.result.fingerprint).toBe(r.fingerprint);
    expect(read.ok && read.value?.inputHash).toBe(r.inputHash);
    const listed = await repo.runs(v.value.strategyId);
    expect(listed.ok && listed.value).toHaveLength(1);

    expect((await repo.savePlaybook({ strategyId: v.value.strategyId, hypothesis: ' ', conditions: '', invalidation: '', limitations: '', notes: '', runId: null }, NOW)).ok).toBe(false);
    expect((await repo.savePlaybook({ strategyId: v.value.strategyId, hypothesis: 'Trends persist', conditions: '', invalidation: '', limitations: '', notes: '', runId: 'run_other' }, NOW)).ok).toBe(false);
    const pb = await repo.savePlaybook({ strategyId: v.value.strategyId, hypothesis: 'Trends persist', conditions: 'Trending markets', invalidation: 'OOS below 0R', limitations: 'Simulated data', notes: '', runId: saved.value.id }, NOW);
    expect(pb.ok).toBe(true);
    const again = await repo.savePlaybook({ strategyId: v.value.strategyId, hypothesis: 'Trends persist, mostly', conditions: '', invalidation: '', limitations: '', notes: '', runId: saved.value.id }, LATER);
    expect(again.ok).toBe(true);
    const back = await repo.playbook(v.value.strategyId);
    expect(back.ok && back.value).toMatchObject({ hypothesis: 'Trends persist, mostly', runId: saved.value.id, updatedAt: LATER });
  });

  it('skips stored rows that fail validation', async () => {
    const db = await fresh();
    const repo = createBacktestRepository(db, createChangeBus(), newId);
    await db.runAsync('INSERT INTO strategy_version (strategy_id, version, name, definition, template_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['stg_x', 1, 'Broken', '{"riskPercent":99}', null, '', NOW]);
    const all = await repo.strategies();
    expect(all.ok && all.value).toEqual([]);
  });

  it('round-trips through a backup and refuses a backup with a bad definition', async () => {
    const db = await fresh();
    const repo = createBacktestRepository(db, createChangeBus(), newId);
    const v = await repo.saveVersion({ strategyId: null, name: 'Trend', definition: DEF, templateId: null, note: '' }, NOW);
    if (!v.ok) throw new Error('save');
    const run = await repo.saveRun(v.value.strategyId, 1, INPUTS, result(), NOW);
    if (!run.ok) throw new Error('run');
    await repo.savePlaybook({ strategyId: v.value.strategyId, hypothesis: 'H', conditions: '', invalidation: '', limitations: '', notes: '', runId: run.value.id }, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = createBacktestRepository(target, createChangeBus(), newId);
    const runs = await restored.runs(null);
    expect(runs.ok && runs.value.map((r) => r.result.fingerprint)).toEqual([run.value.result.fingerprint]);
    const pb = await restored.playbook(v.value.strategyId);
    expect(pb.ok && pb.value?.runId).toBe(run.value.id);

    const rows = backup.value.tables.strategy_version ?? [];
    const bad = { ...backup.value, tables: { ...backup.value.tables, strategy_version: rows.map((r) => ({ ...r, definition: '{"instrumentId":"nope"}' })) } };
    expect((await restoreBackup(await fresh(), createChangeBus(), bad)).ok).toBe(false);
  });

  it('stores a result without its trades', () => {
    const r = result();
    const s = storedResult(r);
    expect(s.tradeCount).toBe(r.trades.length);
    expect(Object.keys(s)).not.toContain('trades');
  });
});

describe('simulated dataset source', () => {
  it('labels its data and loads the seeded candles', async () => {
    const source = createSimulatedDatasetSource();
    expect(source.label).toBe('Simulated data');
    const ds = await source.load(INPUTS.dataset);
    expect(ds.ok && ds.value.candles).toHaveLength(1500);
    expect((await source.load({ ...INPUTS.dataset, instrumentId: 'real-eurusd' })).ok).toBe(false);
  });
});

describe('backtest repository review fixes', () => {
  it('refuses to add a version on top of an unreadable latest version, with a data-quality error', async () => {
    const db = await fresh();
    const repo = createBacktestRepository(db, createChangeBus(), newId);
    const v1 = await repo.saveVersion({ strategyId: null, name: 'Mine', definition: DEF, templateId: null, note: '' }, NOW);
    if (!v1.ok) throw new Error(v1.error.message);
    await db.runAsync('UPDATE strategy_version SET definition = ? WHERE strategy_id = ?', ['{"broken":true}', v1.value.strategyId]);
    const next = await repo.saveVersion({ strategyId: v1.value.strategyId, name: 'Mine', definition: { ...DEF, riskPercent: 0.5 }, templateId: null, note: '' }, LATER);
    expect(next.ok).toBe(false);
    if (!next.ok) {
      expect(next.error.kind).toBe('DataQualityError');
      expect(next.error.message).not.toMatch(/no longer exists/);
    }
    const gone = await repo.saveVersion({ strategyId: 'stg_missing', name: 'Mine', definition: DEF, templateId: null, note: '' }, LATER);
    expect(!gone.ok && gone.error.message).toMatch(/no longer exists/);
  });

  it('stores the result schema version, and still loads runs saved before it existed', async () => {
    const db = await fresh();
    const repo = createBacktestRepository(db, createChangeBus(), newId);
    const v1 = await repo.saveVersion({ strategyId: null, name: 'Mine', definition: DEF, templateId: null, note: '' }, NOW);
    if (!v1.ok) throw new Error(v1.error.message);
    const saved = await repo.saveRun(v1.value.strategyId, 1, INPUTS, result(), NOW);
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.value.result.resultSchemaVersion).toBe(1);
    // An older run: no schema version, no excluded-trade count, no seen-out-of-sample count.
    const old = { ...storedResult(result()) } as Record<string, unknown>;
    delete old.resultSchemaVersion;
    delete old.splitExcluded;
    const { otherVersionsWithOutOfSample: _drop, ...oldInputs } = INPUTS;
    await db.runAsync('INSERT INTO backtest_run (id, strategy_id, version, inputs, input_hash, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'run_old',
      v1.value.strategyId,
      1,
      JSON.stringify(oldInputs),
      'abc',
      JSON.stringify(old),
      NOW,
    ]);
    const loaded = await repo.run('run_old');
    expect(loaded.ok && loaded.value).toMatchObject({ result: { resultSchemaVersion: 0, splitExcluded: 0 }, inputs: { otherVersionsWithOutOfSample: 0 } });
  });

  it('backup checks reject playbook and run rows with bad ids or overlong text', async () => {
    const db = await fresh();
    const repo = createBacktestRepository(db, createChangeBus(), newId);
    const v1 = await repo.saveVersion({ strategyId: null, name: 'Mine', definition: DEF, templateId: null, note: '' }, NOW);
    if (!v1.ok) throw new Error(v1.error.message);
    const run = await repo.saveRun(v1.value.strategyId, 1, INPUTS, result(), NOW);
    if (!run.ok) throw new Error(run.error.message);
    await repo.savePlaybook({ strategyId: v1.value.strategyId, hypothesis: 'h', conditions: 'c', invalidation: 'i', limitations: 'Simulated data', notes: '', runId: run.value.id }, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    const tables = backup.value.tables;
    const withRows = (name: string, rows: unknown[]) => ({ ...backup.value, tables: { ...tables, [name]: rows } }) as typeof backup.value;
    const play = (tables.playbook_entry ?? [])[0]!;
    const runRow = (tables.backtest_run ?? [])[0]!;
    const verRow = (tables.strategy_version ?? [])[0]!;
    for (const bad of [
      withRows('playbook_entry', [{ ...play, strategy_id: 7 }]),
      withRows('playbook_entry', [{ ...play, run_id: 12 }]),
      withRows('playbook_entry', [{ ...play, notes: 'x'.repeat(4001) }]),
      withRows('backtest_run', [{ ...runRow, id: 5 }]),
      withRows('backtest_run', [{ ...runRow, strategy_id: '' }]),
      withRows('strategy_version', [{ ...verRow, strategy_id: null }]),
    ]) {
      const restored = await restoreBackup(target, createChangeBus(), bad);
      expect(restored.ok).toBe(false);
    }
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
  });

  it('restores a schema-10 backup (before backtest tables existed)', async () => {
    const db = await fresh();
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const { strategy_version: _a, backtest_run: _b, playbook_entry: _c, ...older } = backup.value.tables;
    const target = await fresh();
    const restored = await restoreBackup(target, createChangeBus(), { ...backup.value, schemaVersion: 10, tables: older });
    expect(restored.ok).toBe(true);
    expect(await target.getAllAsync('SELECT * FROM strategy_version', [])).toHaveLength(0);
  });
});
