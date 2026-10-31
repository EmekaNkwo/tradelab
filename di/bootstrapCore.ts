import { loadBundledContent } from '../data/content/contentLoader';
import type { BackupFileGateway } from '../data/backup/backupFiles';
import type { AppLauncher } from '../data/apps/types';
import type { JournalFileGateway } from '../data/files/journalFiles';
import type { ReminderGateway } from '../data/reminders/types';
import type { TaskNotificationGateway } from '../data/reminders/taskNotification';
import type { DatasetFileGateway } from '../data/files/datasetFiles';
import { SECRET_NAMES, type SecretStore } from '../data/secure/types';
import type { MarketDataProvider } from '../data/market/provider';
import type { CloudCoachTransport } from '../data/coach/types';
import type { SqlDatabase } from '../data/db/client';
import { runMigrations } from '../data/db/migrate';
import { MIGRATIONS } from '../data/db/migrations';
import type { Container } from '../features/app';
import { BACKGROUND, resyncReminders, scheduleNewContent } from '../features/learning';
import type { AppError } from '../shared/errors';
import { logger } from '../shared/logger';
import { ok, type Result } from '../shared/result';
import { toUtcIso, type Clock } from '../shared/time';
import { createContainer } from './createContainer';

export async function primeSecretRedaction(secrets: SecretStore): Promise<void> {
  for (const name of SECRET_NAMES) {
    const read = await secrets.get(name);
    if (!read.ok) logger.warn('A saved key could not be read at start-up', { kind: read.error.kind });
  }
}

/** Prepares an open database: validates content, migrates, records the content version, builds the container. */
export async function bootstrapWithDatabase(
  db: SqlDatabase,
  clock: Clock,
  appVersion: string,
  devices: {
    readonly backupFiles: BackupFileGateway;
    readonly reminders: ReminderGateway;
    readonly taskNotifications: TaskNotificationGateway;
    readonly apps: AppLauncher;
    readonly journalFiles: JournalFileGateway;
    readonly secrets: SecretStore;
    readonly datasetFiles: DatasetFileGateway;
    readonly marketProvider: MarketDataProvider;
    readonly cloudCoach: CloudCoachTransport;
  },
): Promise<Result<Container, AppError>> {
  const content = loadBundledContent();
  if (!content.ok) return content;

  const now = toUtcIso(clock.now());
  const migrated = await runMigrations(db, MIGRATIONS, now);
  if (!migrated.ok) return migrated;
  if (migrated.value.applied.length > 0) logger.info('Applied migrations', { applied: migrated.value.applied });

  const container = createContainer({ db, content: content.value, clock, appVersion, ...devices });
  const recorded = await container.contentVersion.record(content.value.version, content.value.hash, now);
  if (!recorded.ok) return recorded;
  // New content can add modules to a program the learner is following. This runs on every start, not only when
  // the content version changes, so an attempt that failed last time is retried; it changes nothing when the
  // schedule is already complete, and a failure never blocks the app.
  const scheduled = await scheduleNewContent(container);
  if (!scheduled.ok) logger.warn('New content could not be added to the schedule', { kind: scheduled.error.kind });
  else if (scheduled.value) logger.info('Schedule rebuilt to include new content');
  // Weak-concept and backup reminders depend on data that changes between visits. Start-up neither waits for
  // this nor shows the permission prompt; resyncReminders logs its own failures.
  void resyncReminders(container, BACKGROUND);
  // Reading each saved key once registers it with the log redactor (the store does that on read), so a key
  // is masked in logs even before any screen uses it. Start-up does not wait for this.
  void primeSecretRedaction(devices.secrets);
  // No task screen is open at start-up, so a step notice left by a killed app is stale; remove it.
  void devices.taskNotifications.clear().then((r) => {
    if (!r.ok) logger.warn('Stale task notification not cleared', { kind: r.error.kind });
  });
  return ok(container);
}
