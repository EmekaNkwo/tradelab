import type { UtcIso } from '../../../shared/time';
import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { createBackup } from '../../backup/export';
import { requiredTables } from '../../backup/format';
import { restoreBackup } from '../../backup/restore';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createAwardRepository } from '../awardRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const LATER = '2026-11-05T10:00:00.000Z' as UtcIso;

async function fresh(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

describe('award repository (latched awards, spec §29)', () => {
  it('stores first unlocks and keeps the original date when met again', async () => {
    const db = await fresh();
    const bus = createChangeBus();
    const changed = jest.fn();
    bus.subscribe(['award_unlock'], changed);
    const repo = createAwardRepository(db, bus);
    expect((await repo.recordUnlocks([], NOW)).ok).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect((await repo.recordUnlocks([{ kind: 'challenge', awardId: 'risk-management' }, { kind: 'badge', awardId: 'chart_reader' }], NOW)).ok).toBe(true);
    expect((await repo.recordUnlocks([{ kind: 'challenge', awardId: 'risk-management' }], LATER)).ok).toBe(true);
    const unlocks = await repo.unlocks();
    expect(unlocks.ok && unlocks.value).toEqual([
      { kind: 'challenge', awardId: 'risk-management', unlockedAt: NOW },
      { kind: 'badge', awardId: 'chart_reader', unlockedAt: NOW },
    ]);
    expect(changed).toHaveBeenCalledWith(['award_unlock']);
    expect((await repo.recordUnlocks([{ kind: 'trophy' as never, awardId: 'x' }], NOW)).ok).toBe(false);
    db.close();
  });

  it('reports a storage failure', async () => {
    const db = await fresh();
    db.close();
    const r = await createAwardRepository(db, createChangeBus()).unlocks();
    expect(!r.ok && r.error.kind).toBe('StorageError');
  });

  it('survives backup and restore; a bad row is rejected; older backups do not need the table', async () => {
    const db = await fresh();
    await createAwardRepository(db, createChangeBus()).recordUnlocks([{ kind: 'milestone', awardId: 'reviews_5' }], NOW);
    const backup = await createBackup(db, '0.1.0', NOW);
    if (!backup.ok) throw new Error(backup.error.message);
    const target = await fresh();
    expect((await restoreBackup(target, createChangeBus(), backup.value)).ok).toBe(true);
    const restored = await createAwardRepository(target, createChangeBus()).unlocks();
    expect(restored.ok && restored.value).toEqual([{ kind: 'milestone', awardId: 'reviews_5', unlockedAt: NOW }]);

    const rows = backup.value.tables.award_unlock!;
    const broken = { ...backup.value, tables: { ...backup.value.tables, award_unlock: rows.map((r) => ({ ...r, unlocked_at: 'soon' })) } };
    expect((await restoreBackup(target, createChangeBus(), broken)).ok).toBe(false);
    expect(requiredTables(11)).not.toContain('award_unlock');
    expect(requiredTables(12)).toContain('award_unlock');
    db.close();
    target.close();
  });
});
