import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { requiredTables } from '../../backup/format';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createLabRepository } from '../labRepository';
import { createStrategyRepository } from '../strategyRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const LATER = '2026-10-29T11:00:00.000Z' as UtcIso;
let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

const studyOrder = async (db: TestDatabase) => {
  const r = await createStrategyRepository(db, createChangeBus()).saved();
  return r.ok ? r.value.filter((s) => s.list === 'study').map((s) => s.strategyId) : null;
};

describe('strategy repository', () => {
  it('adds once per list, removes, and tells listeners', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    let changes = 0;
    bus.subscribe(['strategy_saved'], () => {
      changes += 1;
    });
    const repo = createStrategyRepository(db, bus);
    expect((await repo.add('range-trading', 'bookmark', NOW)).ok).toBe(true);
    expect((await repo.add('range-trading', 'bookmark', LATER)).ok).toBe(true);
    expect((await repo.add('range-trading', 'study', NOW)).ok).toBe(true);
    const saved = await repo.saved();
    expect(saved.ok && saved.value).toEqual([
      { strategyId: 'range-trading', list: 'bookmark', addedAt: NOW },
      { strategyId: 'range-trading', list: 'study', addedAt: NOW },
    ]);
    expect((await repo.remove('range-trading', 'bookmark')).ok).toBe(true);
    const after = await repo.saved();
    expect(after.ok && after.value.map((s) => s.list)).toEqual(['study']);
    expect(changes).toBe(4);
  });

  it('keeps the study list in order and moves items up and down', async () => {
    const db = await fresh();
    const repo = createStrategyRepository(db, createChangeBus());
    const shown = ['a-one', 'b-two', 'c-three'];
    for (const id of shown) await repo.add(id, 'study', NOW);
    expect(await studyOrder(db)).toEqual(['a-one', 'b-two', 'c-three']);
    await repo.move('c-three', -1, shown);
    expect(await studyOrder(db)).toEqual(['a-one', 'c-three', 'b-two']);
    await repo.move('a-one', -1, shown);
    await repo.move('b-two', 1, shown);
    expect(await studyOrder(db)).toEqual(['a-one', 'c-three', 'b-two']);
    await repo.move('a-one', 1, shown);
    expect(await studyOrder(db)).toEqual(['c-three', 'a-one', 'b-two']);
    await repo.remove('a-one', 'study');
    await repo.add('d-four', 'study', NOW);
    expect(await studyOrder(db)).toEqual(['c-three', 'b-two', 'd-four']);
  });

  it('moves past saved items whose page is no longer in the content, leaving them in place', async () => {
    const db = await fresh();
    const repo = createStrategyRepository(db, createChangeBus());
    for (const id of ['a-one', 'gone-page', 'b-two']) await repo.add(id, 'study', NOW);
    // The learner sees a-one and b-two side by side; gone-page is hidden.
    await repo.move('b-two', -1, ['a-one', 'b-two']);
    expect(await studyOrder(db)).toEqual(['b-two', 'gone-page', 'a-one']);
    await repo.move('b-two', -1, ['a-one', 'b-two']);
    expect(await studyOrder(db)).toEqual(['b-two', 'gone-page', 'a-one']);
  });

  it('refuses invalid input and reports storage failures', async () => {
    const db = await fresh();
    const repo = createStrategyRepository(db, createChangeBus());
    const bad = await repo.add('Not An Id', 'bookmark', NOW);
    expect(!bad.ok && bad.error.kind).toBe('ValidationError');
    expect((await repo.add('range-trading', 'other' as never, NOW)).ok).toBe(false);
    await db.execAsync('DROP TABLE strategy_saved');
    expect((await repo.add('range-trading', 'study', NOW)).ok).toBe(false);
    expect((await repo.saved()).ok).toBe(false);
    expect((await repo.move('range-trading', 1, ['range-trading'])).ok).toBe(false);
  });

  it('survives backup and restore, and restore rejects a corrupt row', async () => {
    const db = await fresh();
    const repo = createStrategyRepository(db, createChangeBus());
    await repo.add('range-trading', 'study', NOW);
    await repo.add('carry-concept', 'bookmark', NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    expect(requiredTables(10)).toContain('strategy_saved');
    expect(requiredTables(9)).not.toContain('strategy_saved');
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = await createStrategyRepository(target, createChangeBus()).saved();
    expect(restored.ok && restored.value.map((s) => `${s.list}:${s.strategyId}`)).toEqual(['bookmark:carry-concept', 'study:range-trading']);

    const rows = backup.value.tables.strategy_saved ?? [];
    const bad = { ...backup.value, tables: { ...backup.value.tables, strategy_saved: rows.map((r) => ({ ...r, strategy_id: 'Bad Id' })) } };
    expect((await restoreBackup(await fresh(), createChangeBus(), bad)).ok).toBe(false);
  });
});

describe('migration 0010', () => {
  it('keeps existing lab attempts and allows the new strategy kinds', async () => {
    const db = openTestDatabase();
    await runMigrations(db, MIGRATIONS.filter((m) => m.version < 10), NOW);
    await db.runAsync("INSERT INTO lab_attempt (id, kind, ref_id, picked, score, answered_at) VALUES ('seeded', 'red_flag', 'case-a', '[\"a\"]', 0.5, ?)", [NOW]);
    expect((await runMigrations(db, MIGRATIONS, NOW)).ok).toBe(true);
    const labs = createLabRepository(db, createChangeBus(), newId);
    expect((await labs.record({ kind: 'strategy_check', refId: 'range-trading', picked: ['range-trading-q1=a'], score: 1 }, LATER)).ok).toBe(true);
    expect((await labs.record({ kind: 'strategy_exercise', refId: 'range-trading', picked: ['a', 'b'], score: 0.6 }, LATER)).ok).toBe(true);
    const all = await labs.attempts();
    expect(all.ok && all.value.map((a) => `${a.kind}:${a.refId}`).sort()).toEqual(['red_flag:case-a', 'strategy_check:range-trading', 'strategy_exercise:range-trading']);
    await expect(db.runAsync("INSERT INTO lab_attempt (id, kind, ref_id, picked, score, answered_at) VALUES ('x', 'other', 'r', '[]', 0, ?)", [NOW])).rejects.toThrow();
    const index = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_lab_attempt_ref'", []);
    expect(index).toHaveLength(1);
  });
});
