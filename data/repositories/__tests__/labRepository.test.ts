import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createLabRepository, MAX_LAB_PICKS } from '../labRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const LATER = '2026-10-29T11:00:00.000Z' as UtcIso;
let seq = 0;
const newId = (prefix: string) => `${prefix}_${(seq += 1)}`;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

describe('lab repository', () => {
  it('records answers newest first and tells listeners', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    let changes = 0;
    bus.subscribe(['lab_attempt'], () => {
      changes += 1;
    });
    const repo = createLabRepository(db, bus, newId);
    expect((await repo.record({ kind: 'red_flag', refId: 'case-a', picked: ['a', 'c'], score: 0.5 }, NOW)).ok).toBe(true);
    expect((await repo.record({ kind: 'scenario', refId: 'scn-b', picked: [], score: 0.75 }, LATER)).ok).toBe(true);
    const all = await repo.attempts();
    expect(all.ok && all.value.map((a) => [a.refId, a.picked, a.score])).toEqual([
      ['scn-b', [], 0.75],
      ['case-a', ['a', 'c'], 0.5],
    ]);
    expect(changes).toBe(2);
  });

  it('refuses invalid answers and skips unreadable rows', async () => {
    const db = await fresh();
    const repo = createLabRepository(db, createChangeBus(), newId);
    const bad = await repo.record({ kind: 'red_flag', refId: '', picked: [], score: 2 }, NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe('ValidationError');
    await db.runAsync("INSERT INTO lab_attempt (id, kind, ref_id, picked, score, answered_at) VALUES ('x', 'scenario', 'r', 'not json', 0, ?)", [NOW]);
    await db.runAsync("INSERT INTO lab_attempt (id, kind, ref_id, picked, score, answered_at) VALUES ('y', 'scenario', 'r', '{}', 0, ?)", [NOW]);
    const all = await repo.attempts();
    expect(all.ok && all.value).toEqual([]);
  });

  it('saves a long knowledge check with more than 40 picks, up to the cap', async () => {
    const db = await fresh();
    const repo = createLabRepository(db, createChangeBus(), newId);
    const picks = Array.from({ length: 60 }, (_, i) => `long-check-q${i + 1}=a`);
    const saved = await repo.record({ kind: 'strategy_check', refId: 'long-check', picked: picks, score: 1 }, NOW);
    expect(saved.ok && saved.value.picked).toHaveLength(60);
    const tooMany = Array.from({ length: MAX_LAB_PICKS + 1 }, (_, i) => `q${i}=a`);
    expect((await repo.record({ kind: 'strategy_check', refId: 'long-check', picked: tooMany, score: 1 }, NOW)).ok).toBe(false);
  });

  it('reports storage failures', async () => {
    const db = await fresh();
    await db.execAsync('DROP TABLE lab_attempt');
    const repo = createLabRepository(db, createChangeBus(), newId);
    expect((await repo.record({ kind: 'scenario', refId: 'r', picked: [], score: 0 }, NOW)).ok).toBe(false);
    expect((await repo.attempts()).ok).toBe(false);
  });

  it('survives backup and restore, and restore rejects corrupt picks', async () => {
    const db = await fresh();
    await createLabRepository(db, createChangeBus(), newId).record({ kind: 'red_flag', refId: 'case-a', picked: ['b'], score: 1 }, NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = await createLabRepository(target, createChangeBus(), newId).attempts();
    expect(restored.ok && restored.value.map((a) => a.picked)).toEqual([['b']]);

    const rows = backup.value.tables.lab_attempt ?? [];
    const bad = { ...backup.value, tables: { ...backup.value.tables, lab_attempt: rows.map((r) => ({ ...r, picked: '{"a":1}' })) } };
    expect((await restoreBackup(await fresh(), createChangeBus(), bad)).ok).toBe(false);
  });
});
