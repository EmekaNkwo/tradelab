import Constants from 'expo-constants';
import { createBackupFileGateway } from '../data/backup/backupFiles';
import { createJournalFileGateway } from '../data/files/journalFiles';
import { openAppDatabase } from '../data/db/expoDatabase';
import { createAppLauncher } from '../integrations/apps/expoAppLauncher';
import { createExpoReminderGateway } from '../integrations/notifications/expoReminders';
import { createExpoTaskNotificationGateway } from '../integrations/notifications/expoTaskNotification';
import { createDatasetFileGateway } from '../data/files/datasetFiles';
import { createExpoSecretStore } from '../integrations/secure/expoSecretStore';
import { createTwelveDataProvider } from '../integrations/http/twelveData';
import { createAnthropicCoachTransport } from '../integrations/http/anthropicCoach';
import type { Container } from '../features/app';
import { fromUnknown, type AppError } from '../shared/errors';
import { logger } from '../shared/logger';
import { err, type Result } from '../shared/result';
import { systemClock } from '../shared/time';
import { bootstrapWithDatabase } from './bootstrapCore';

let inFlight: Promise<Result<Container, AppError>> | null = null;

/**
 * Opens the on-device database and builds the app container. Concurrent
 * callers (React StrictMode double effects, fast retries) share one run, so
 * migrations never execute twice in parallel. A failed run can be retried.
 */
export function bootstrap(): Promise<Result<Container, AppError>> {
  if (!inFlight) {
    inFlight = runBootstrap().then((result) => {
      if (!result.ok) inFlight = null;
      return result;
    });
  }
  return inFlight;
}

async function runBootstrap(): Promise<Result<Container, AppError>> {
  try {
    const db = await openAppDatabase();
    return await bootstrapWithDatabase(db, systemClock, Constants.expoConfig?.version ?? '0.0.0', {
      backupFiles: createBackupFileGateway(),
      reminders: createExpoReminderGateway(),
      taskNotifications: createExpoTaskNotificationGateway(),
      apps: createAppLauncher(),
      journalFiles: createJournalFileGateway(),
      secrets: createExpoSecretStore(),
      datasetFiles: createDatasetFileGateway(),
      marketProvider: createTwelveDataProvider(),
      cloudCoach: createAnthropicCoachTransport(),
    });
  } catch (cause) {
    logger.error('Bootstrap failed', { cause: String(cause) });
    return err(fromUnknown('StorageError', 'Opening the database failed', cause));
  }
}
