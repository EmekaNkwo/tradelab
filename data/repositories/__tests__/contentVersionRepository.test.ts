import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import type { UtcIso } from '../../../shared/time';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createContentVersionRepository } from '../contentVersionRepository';

const T1 = '2026-10-29T10:00:00.000Z' as UtcIso;
const T2 = '2026-11-01T10:00:00.000Z' as UtcIso;

describe('contentVersionRepository', () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = openTestDatabase();
    await runMigrations(db, MIGRATIONS, T1);
  });
  afterEach(() => db.close());

  it('records first install, ignores unchanged content, and detects updates', async () => {
    const repo = createContentVersionRepository(db);
    expect(await repo.get()).toEqual({ ok: true, value: null });
    expect(await repo.record('2026.10.1', 'aaaa', T1)).toEqual({ ok: true, value: true });
    expect(await repo.record('2026.10.1', 'aaaa', T2)).toEqual({ ok: true, value: false });
    expect(await repo.record('2026.11.0', 'bbbb', T2)).toEqual({ ok: true, value: true });
    expect(await repo.get()).toEqual({ ok: true, value: { version: '2026.11.0', contentHash: 'bbbb', installedAt: T2 } });
  });
});
