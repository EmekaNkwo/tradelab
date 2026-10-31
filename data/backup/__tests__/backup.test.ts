import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import type { UtcIso } from '../../../shared/time';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from '../../db/migrations';
import { createSettingsRepository } from '../../repositories/settingsRepository';
import { upgradeBackup, type BackupMigrationStep } from '../backupMigrations';
import { backupFileName, createBackup, serializeBackup } from '../export';
import { requiredTables, type BackupFile } from '../format';
import { parseBackup, restoreBackup } from '../restore';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;

async function freshDb(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await runMigrations(db, MIGRATIONS, NOW);
  return db;
}

async function insertProfile(db: TestDatabase): Promise<void> {
  await db.runAsync(
    `INSERT INTO user_profile (id, experience, markets, goals, explanation_level, metatrader, time_zone, risk_acknowledged_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['usr_1', 'complete_beginner', '["forex"]', '["risk_management"]', 'simple', null, 'Africa/Lagos', NOW, NOW, NOW],
  );
}

describe('backup and restore', () => {
  let source: TestDatabase;
  let target: TestDatabase;
  beforeEach(async () => {
    source = await freshDb();
    target = await freshDb();
  });
  afterEach(() => {
    source.close();
    target.close();
  });

  it('round-trips learner data into a fresh install', async () => {
    await createSettingsRepository(source, createChangeBus()).update({ theme: 'dark' }, NOW);
    await insertProfile(source);

    const backup = await createBackup(source, '0.1.0', NOW);
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    const parsed = parseBackup(serializeBackup(backup.value));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const bus = createChangeBus();
    const listener = jest.fn();
    bus.subscribe(['settings'], listener);
    const restored = await restoreBackup(target, bus, parsed.value);
    expect(restored).toMatchObject({
      ok: true,
      value: { createdAt: NOW, appVersion: '0.1.0', schemaVersion: LATEST_SCHEMA_VERSION, rowCounts: { settings: 1, user_profile: 1, daily_class: 0 } },
    });
    expect(listener).toHaveBeenCalled();
    const settings = await createSettingsRepository(target, createChangeBus()).get();
    expect(settings.ok && settings.value.theme).toBe('dark');
    const profile = await target.getFirstAsync<{ id: string }>('SELECT id FROM user_profile', []);
    expect(profile?.id).toBe('usr_1');
  });

  it('replaces existing data rather than merging', async () => {
    await insertProfile(target);
    const backup = await createBackup(source, '0.1.0', NOW);
    if (!backup.ok) throw new Error('backup failed');
    await restoreBackup(target, createChangeBus(), backup.value);
    expect(await target.getAllAsync('SELECT * FROM user_profile', [])).toHaveLength(0);
  });

  it('names backup files by timestamp', () => {
    expect(backupFileName(NOW)).toBe('tradelab-backup-2026-10-29-10-00-00.json');
  });

  describe('rejects untrusted or incompatible files', () => {
    const valid = (): BackupFile => ({
      format: 'tradelab-backup',
      formatVersion: 1,
      appVersion: '0.1.0',
      schemaVersion: 1,
      createdAt: NOW,
      tables: { settings: [], user_profile: [] },
    });

    it.each([
      ['not JSON', '{oops'],
      ['wrong format', JSON.stringify({ ...valid(), format: 'other' })],
      ['newer format', JSON.stringify({ ...valid(), formatVersion: 99 })],
      ['unknown table', JSON.stringify({ ...valid(), tables: { ...valid().tables, sqlite_master: [] } })],
      ['nested values', JSON.stringify({ ...valid(), tables: { ...valid().tables, settings: [{ key: { a: 1 } }] } })],
      ['missing tables (would wipe data)', JSON.stringify({ ...valid(), tables: {} })],
    ])('%s', (_label, text) => {
      const result = parseBackup(text);
      expect(!result.ok && result.error.kind).toBe('DataQualityError');
    });

    it('unknown column names (SQL injection attempt) without changing data', async () => {
      await insertProfile(target);
      const file = { ...valid(), tables: { ...valid().tables, settings: [{ 'key) VALUES (1); DROP TABLE user_profile; --': 'x' }] } };
      const result = await restoreBackup(target, createChangeBus(), file);
      expect(!result.ok && result.error.kind).toBe('DataQualityError');
      expect(await target.getAllAsync('SELECT * FROM user_profile', [])).toHaveLength(1);
    });

    it('a constraint failure mid-restore rolls everything back', async () => {
      await insertProfile(target);
      const file = { ...valid(), tables: { ...valid().tables, settings: [{ key: 'theme', value: '"dark"', updated_at: null }] } };
      const result = await restoreBackup(target, createChangeBus(), file);
      expect(result.ok).toBe(false);
      expect(await target.getAllAsync('SELECT * FROM user_profile', [])).toHaveLength(1);
    });

    it('unparsed files passed straight to restore (whitelist is re-checked)', async () => {
      await insertProfile(target);
      const sneaky = { ...valid(), tables: { ...valid().tables, 'migration_log': [] } };
      const result = await restoreBackup(target, createChangeBus(), sneaky);
      expect(!result.ok && result.error.message).toMatch(/unknown tables/);
      const sparse = { ...valid(), tables: {} };
      const sparseResult = await restoreBackup(target, createChangeBus(), sparse);
      expect(!sparseResult.ok && sparseResult.error.message).toMatch(/missing tables/);
      expect(await target.getAllAsync('SELECT * FROM user_profile', [])).toHaveLength(1);
    });

    it('a backup from a newer schema', () => {
      const result = upgradeBackup({ ...valid(), schemaVersion: 5 }, 1);
      expect(!result.ok && result.error.message).toMatch(/newer app version/);
    });
  });

  it('restores a schema-1 backup (before learning tables existed) into the current schema', async () => {
    await insertProfile(target);
    const v1: BackupFile = {
      format: 'tradelab-backup',
      formatVersion: 1,
      appVersion: '0.1.0',
      schemaVersion: 1,
      createdAt: NOW,
      tables: { settings: [{ key: 'theme', value: '"dark"', updated_at: NOW }], user_profile: [] },
    };
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    const result = await restoreBackup(target, createChangeBus(), v1);
    expect(result.ok).toBe(true);
    expect(await target.getAllAsync('SELECT * FROM user_profile', [])).toHaveLength(0);
  });

  it('older backups need only the tables that existed at their schema version', () => {
    const specs = [
      { name: 'settings', sinceSchema: 1 },
      { name: 'program_enrolment', sinceSchema: 2 },
    ];
    expect(requiredTables(1, specs)).toEqual(['settings']);
    expect(requiredTables(2, specs)).toEqual(['settings', 'program_enrolment']);
    expect(requiredTables(8)).not.toContain('lab_attempt');
    expect(requiredTables(9)).toContain('lab_attempt');
  });

  it('upgrades older backups through registered steps', () => {
    const old: BackupFile = {
      format: 'tradelab-backup',
      formatVersion: 1,
      appVersion: '0.0.1',
      schemaVersion: 1,
      createdAt: NOW,
      tables: { settings: [{ key: 'colour', value: '"dark"', updated_at: NOW }] },
    };
    const steps = [
      {
        fromSchema: 1,
        migrate: (tables: Parameters<BackupMigrationStep['migrate']>[0]) => ({
          ...tables,
          settings: (tables.settings ?? []).map((r) => (r.key === 'colour' ? { ...r, key: 'theme' } : r)),
        }),
      },
    ];
    const result = upgradeBackup(old, 2, steps);
    expect(result.ok && result.value.schemaVersion).toBe(2);
    expect(result.ok && result.value.tables.settings?.[0]?.key).toBe('theme');
    expect(old.tables.settings?.[0]?.key).toBe('colour');
  });
});
