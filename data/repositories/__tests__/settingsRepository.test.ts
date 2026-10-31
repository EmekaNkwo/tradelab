import { openTestDatabase, type TestDatabase } from '../../../testing/nodeSqlite';
import type { UtcIso } from '../../../shared/time';
import { createChangeBus } from '../../db/changeBus';
import { runMigrations } from '../../db/migrate';
import { MIGRATIONS } from '../../db/migrations';
import { createSettingsRepository, DEFAULT_SETTINGS } from '../settingsRepository';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;

describe('settingsRepository', () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = openTestDatabase();
    await runMigrations(db, MIGRATIONS, NOW);
  });
  afterEach(() => db.close());

  it('returns defaults when nothing is stored (West Africa Time, simple explanations)', async () => {
    const repo = createSettingsRepository(db, createChangeBus());
    expect(await repo.get()).toEqual({ ok: true, value: DEFAULT_SETTINGS });
    expect(DEFAULT_SETTINGS.timeZone).toBe('Africa/Lagos');
    expect(DEFAULT_SETTINGS.explanationLevel).toBe('simple');
  });

  it('persists updates and notifies listeners', async () => {
    const bus = createChangeBus();
    const listener = jest.fn();
    bus.subscribe(['settings'], listener);
    const repo = createSettingsRepository(db, bus);

    const result = await repo.update({ theme: 'dark' }, NOW);
    expect(result.ok && result.value.theme).toBe('dark');
    expect(listener).toHaveBeenCalledWith(['settings']);

    const reread = await createSettingsRepository(db, createChangeBus()).get();
    expect(reread.ok && reread.value.theme).toBe('dark');
  });

  it('rejects invalid values without writing', async () => {
    const repo = createSettingsRepository(db, createChangeBus());
    const result = await repo.update({ timeZone: 'Mars/Olympus' }, NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('ValidationError');
    const reread = await repo.get();
    expect(reread.ok && reread.value.timeZone).toBe('Africa/Lagos');
  });

  it('falls back to defaults for corrupt stored values', async () => {
    await db.runAsync('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', ['theme', '{not json', NOW]);
    await db.runAsync('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', ['explanationLevel', '"expert"', NOW]);
    const result = await createSettingsRepository(db, createChangeBus()).get();
    expect(result.ok && result.value).toEqual(DEFAULT_SETTINGS);
  });

  it('reports storage failures as StorageError', async () => {
    const repo = createSettingsRepository(db, createChangeBus());
    db.close();
    const result = await repo.get();
    expect(!result.ok && result.error.kind).toBe('StorageError');
    db = openTestDatabase();
  });
});

describe('changeBus', () => {
  it('keeps notifying other subscribers when one throws', () => {
    const bus = createChangeBus();
    const after = jest.fn();
    bus.subscribe(['settings'], () => {
      throw new Error('boom');
    });
    bus.subscribe(['settings'], after);
    expect(() => bus.emit(['settings'])).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('only notifies subscribers of matching tables and supports unsubscribe', () => {
    const bus = createChangeBus();
    const a = jest.fn();
    const b = jest.fn();
    const unsubscribe = bus.subscribe(['settings'], a);
    bus.subscribe(['journal_entry'], b);
    bus.emit(['settings']);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    unsubscribe();
    bus.emit(['settings']);
    expect(a).toHaveBeenCalledTimes(1);
  });
});
