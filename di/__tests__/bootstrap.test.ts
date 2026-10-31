import { createFakeApps } from '../../testing/fakeApps';
import { createFakeReminders } from '../../testing/fakeReminders';
import { openTestDatabase } from '../../testing/nodeSqlite';
import { createFakeFiles } from '../../testing/fakeFiles';
import { fixedClock } from '../../shared/time';
import { bootstrapWithDatabase } from '../bootstrapCore';
import { createFakeJournalFiles } from '../../testing/fakeJournalFiles';
import { createOnlineFakes } from '../../testing/fakeOnline';
import { contentWithoutModule } from '../../testing/strategyFixtures';
import { toLocalDate } from '../../domain/learning';
import { completeOnboarding } from '../../features/learning/useCases';
import { logger } from '../../shared/logger';

const devices = () => ({ backupFiles: createFakeFiles(), reminders: createFakeReminders(), apps: createFakeApps(), journalFiles: createFakeJournalFiles(), ...createOnlineFakes() });

describe('bootstrapWithDatabase', () => {
  it('clears a MetaTrader step notice left behind by a killed app (no task screen is open at start-up)', async () => {
    const db = openTestDatabase();
    const d = devices();
    await d.taskNotifications.show({ taskId: 'mt-add-pairs', title: 't', body: 'b' }, { prompt: true });
    expect(d.taskNotifications.current).not.toBeNull();
    const result = await bootstrapWithDatabase(db, fixedClock('2026-10-29T10:00:00.000Z'), '0.1.0', d);
    expect(result.ok).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(d.taskNotifications.current).toBeNull();
    db.close();
  });

  it('migrates a fresh database, records the content version, and returns a working container', async () => {
    const db = openTestDatabase();
    const result = await bootstrapWithDatabase(db, fixedClock('2026-10-29T10:00:00.000Z'), '0.1.0', { backupFiles: createFakeFiles(), reminders: createFakeReminders(), apps: createFakeApps(), journalFiles: createFakeJournalFiles(), ...createOnlineFakes() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const installed = await result.value.contentVersion.get();
    expect(installed.ok && installed.value?.version).toBe(result.value.content.version);
    const settings = await result.value.settings.get();
    expect(settings.ok && settings.value.timeZone).toBe('Africa/Lagos');

    const again = await bootstrapWithDatabase(db, fixedClock('2026-10-30T10:00:00.000Z'), '0.1.0', { backupFiles: createFakeFiles(), reminders: createFakeReminders(), apps: createFakeApps(), journalFiles: createFakeJournalFiles(), ...createOnlineFakes() });
    expect(again.ok).toBe(true);
    db.close();
  });

  it('does not wait for reminders or show the permission prompt at start-up', async () => {
    const db = openTestDatabase();
    let release: () => void = () => undefined;
    const calls: { prompt: boolean }[] = [];
    const stuck = {
      sync: (_plans: unknown, options: { prompt: boolean }) => {
        calls.push(options);
        return new Promise<never>((resolve) => {
          release = () => resolve({ ok: true, value: 'cleared' } as never);
        });
      },
    };
    const result = await bootstrapWithDatabase(db, fixedClock('2026-10-29T10:00:00.000Z'), '0.1.0', { ...devices(), reminders: stuck });
    expect(result.ok).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(calls).toEqual([{ prompt: false }]);
    release();
    await new Promise((r) => setImmediate(r));
    db.close();
  });

  it('surfaces a storage failure instead of a half-started app', async () => {
    const db = openTestDatabase();
    db.close();
    const result = await bootstrapWithDatabase(db, fixedClock('2026-10-29T10:00:00.000Z'), '0.1.0', { backupFiles: createFakeFiles(), reminders: createFakeReminders(), apps: createFakeApps(), journalFiles: createFakeJournalFiles(), ...createOnlineFakes() });
    expect(!result.ok && result.error.kind).toBe('StorageError');
  });

  it('adds new program content on every start, so a missed or failed attempt is retried', async () => {
    const db = openTestDatabase();
    const first = await bootstrapWithDatabase(db, fixedClock('2026-10-29T10:00:00.000Z'), '0.1.0', devices());
    if (!first.ok) throw new Error(first.error.message);
    // Enrol against content without module 9, as if the earlier schedule never picked it up.
    const older = { ...first.value, content: contentWithoutModule('forex-rules-based-strategies') };
    const enrolled = await completeOnboarding(older, {
      riskAcknowledged: true,
      experience: 'complete_beginner',
      markets: ['forex'],
      goals: ['understand_markets'],
      explanationLevel: 'simple',
      metaTrader: { version: 'mt5', installed: false },
      timeZone: 'Africa/Lagos',
      programId: 'practical-forex-trader',
      settings: { startDate: toLocalDate('2026-10-29'), timeline: { kind: 'weeks', weeks: 12 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
      classTime: '19:30',
      remindersEnabled: true,
      placementPassedModuleIds: [],
    });
    if (!enrolled.ok) throw new Error(enrolled.error.message);
    const units = async (c: typeof first.value) => {
      const classes = await c.learning.classes(enrolled.value.id);
      return classes.ok ? classes.value.flatMap((x) => x.unitIds) : [];
    };
    expect((await units(first.value)).includes('forex-rules-based-strategies:checkpoint')).toBe(false);

    // Same content version as before: the old code skipped this; now the start-up adds the module.
    const again = await bootstrapWithDatabase(db, fixedClock('2026-10-29T11:00:00.000Z'), '0.1.0', devices());
    if (!again.ok) throw new Error(again.error.message);
    expect(await units(again.value)).toContain('forex-rules-based-strategies:checkpoint');
    db.close();
  });

  it('logs a scheduling failure and still starts', async () => {
    const db = openTestDatabase();
    const first = await bootstrapWithDatabase(db, fixedClock('2026-10-29T10:00:00.000Z'), '0.1.0', devices());
    expect(first.ok).toBe(true);
    await db.execAsync('DROP TABLE daily_class');
    await db.execAsync('DROP TABLE program_enrolment');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const again = await bootstrapWithDatabase(db, fixedClock('2026-10-29T11:00:00.000Z'), '0.1.0', devices());
    expect(again.ok).toBe(true);
    expect(warn).toHaveBeenCalledWith('New content could not be added to the schedule', expect.anything());
    warn.mockRestore();
    db.close();
  });
});
