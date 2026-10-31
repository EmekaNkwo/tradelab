import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import { currentSchemaVersion, runMigrations } from '../migrate';
import { LATEST_SCHEMA_VERSION as LATEST, MIGRATIONS } from '../migrations';
import type { Migration } from '../migrations';
import type { UtcIso } from '../../../shared/time';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;

const NEXT = LATEST + 1;
const extra: Migration = { version: NEXT, name: 'extra', sql: 'CREATE TABLE extra (id TEXT PRIMARY KEY);' };

describe('runMigrations', () => {
  let db: TestDatabase;
  beforeEach(() => {
    db = openTestDatabase();
  });
  afterEach(() => db.close());

  it('applies all migrations to an empty database', async () => {
    const result = await runMigrations(db, MIGRATIONS, NOW);
    expect(result).toEqual({ ok: true, value: { fromVersion: 0, toVersion: LATEST, applied: MIGRATIONS.map((m) => m.version) } });
    expect(await currentSchemaVersion(db)).toBe(LATEST);
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      [],
    );
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['settings', 'user_profile', 'content_version', 'job', 'migration_log', 'program_enrolment', 'daily_class', 'review_queue', 'mission']),
    );
  });

  it('is idempotent', async () => {
    await runMigrations(db, MIGRATIONS, NOW);
    const second = await runMigrations(db, MIGRATIONS, NOW);
    expect(second).toEqual({ ok: true, value: { fromVersion: LATEST, toVersion: LATEST, applied: [] } });
  });

  it('applies only pending migrations on upgrade', async () => {
    await runMigrations(db, MIGRATIONS, NOW);
    const result = await runMigrations(db, [...MIGRATIONS, extra], NOW);
    expect(result.ok && result.value.applied).toEqual([NEXT]);
  });

  it('refuses when an applied migration was edited', async () => {
    await runMigrations(db, MIGRATIONS, NOW);
    const edited = MIGRATIONS.map((m) => ({ ...m, sql: `${m.sql}\n-- edited` }));
    const result = await runMigrations(db, edited, NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/changed after being applied/);
  });

  it('refuses when the database is newer than the app', async () => {
    await runMigrations(db, [...MIGRATIONS, extra], NOW);
    const result = await runMigrations(db, MIGRATIONS, NOW);
    expect(!result.ok && result.error.message).toMatch(/newer than this app/);
  });

  it('refuses gaps in migration numbering', async () => {
    const result = await runMigrations(db, [{ ...extra, version: NEXT + 1 }], NOW);
    expect(!result.ok && result.error.kind).toBe('StorageError');
  });

  it('rolls back a failing migration and reports it', async () => {
    const broken: Migration = { version: NEXT, name: 'broken', sql: 'CREATE TABLE ok_part (id TEXT); NOT VALID SQL;' };
    await runMigrations(db, MIGRATIONS, NOW);
    const result = await runMigrations(db, [...MIGRATIONS, broken], NOW);
    expect(result.ok).toBe(false);
    expect(await currentSchemaVersion(db)).toBe(LATEST);
    const leftover = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'ok_part'", []);
    expect(leftover).toBeNull();
  });
});
