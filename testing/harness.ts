/**
 * Test-only (no React, usable from Node tests): a real Container (real repositories, real SQL) on an in-memory
 * Node SQLite database, with the device file gateway replaced by a fake.
 */
import { createFakeFiles, type FakeFiles } from './fakeFiles';
import { createFakeApps, type FakeApps } from './fakeApps';
import { createFakeReminders, type FakeReminders } from './fakeReminders';
import { createFakeJournalFiles, type FakeJournalFiles } from './fakeJournalFiles';
import { createOnlineFakes, type FakeCloudCoach, type FakeProvider } from './fakeOnline';
import type { FakeSecretStore } from './fakeSecretStore';
import type { FakeDatasetFiles } from './fakeDatasetFiles';
import type { FakeTaskNotifications } from './fakeTaskNotifications';
import { loadBundledContent } from '../data/content/contentLoader';
import { runMigrations } from '../data/db/migrate';
import { MIGRATIONS } from '../data/db/migrations';
import { createContainer } from '../di/createContainer';
import type { Container } from '../features/app';
import { fixedClock, type Clock, type UtcIso } from '../shared/time';
import { openTestDatabase, type TestDatabase } from './nodeSqlite';

export const TEST_NOW = '2026-10-29T10:00:00.000Z';

export interface TestHarness {
  readonly db: TestDatabase;
  readonly container: Container;
  readonly files: FakeFiles;
  readonly reminders: FakeReminders;
  readonly apps: FakeApps;
  readonly journalFiles: FakeJournalFiles;
  readonly secrets: FakeSecretStore;
  readonly datasetFiles: FakeDatasetFiles;
  readonly provider: FakeProvider;
  readonly cloudCoach: FakeCloudCoach;
  readonly taskNotifications: FakeTaskNotifications;
}

export async function createTestHarness(files: FakeFiles = createFakeFiles(), clock: Clock = fixedClock(TEST_NOW)): Promise<TestHarness> {
  const db = openTestDatabase();
  const reminders = createFakeReminders();
  const apps = createFakeApps();
  const journalFiles = createFakeJournalFiles();
  await runMigrations(db, MIGRATIONS, TEST_NOW as UtcIso);
  const content = loadBundledContent();
  if (!content.ok) throw new Error(content.error.message);
  const online = createOnlineFakes();
  const container = createContainer({ db, content: content.value, clock, appVersion: '0.1.0', backupFiles: files, reminders, apps, journalFiles, ...online });
  return { db, container, files, reminders, apps, journalFiles, secrets: online.secrets, datasetFiles: online.datasetFiles, provider: online.marketProvider, cloudCoach: online.cloudCoach, taskNotifications: online.taskNotifications };
}


/** A clock tests can move forward, e.g. to simulate missed study days. */
export function movableClock(iso: string = TEST_NOW): Clock & { set(iso: string): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current.getTime()),
    set(next: string) {
      current = new Date(next);
    },
  };
}
