/**
 * Composition root (ADR 0001). The only place that wires concrete data and
 * integration implementations to the feature-facing `Container` interface.
 */
import type { BackupFileGateway } from '../data/backup/backupFiles';
import { createBackupService } from '../data/backup/backupService';
import type { ContentRepository } from '../data/content/contentLoader';
import { createChangeBus } from '../data/db/changeBus';
import type { SqlDatabase } from '../data/db/client';
import { createContentVersionRepository } from '../data/repositories/contentVersionRepository';
import { createSettingsRepository } from '../data/repositories/settingsRepository';
import type { AppLauncher } from '../data/apps/types';
import type { ReminderGateway } from '../data/reminders/types';
import type { TaskNotificationGateway } from '../data/reminders/taskNotification';
import { createLearningRepository } from '../data/repositories/learningRepository';
import { createMissionRepository } from '../data/repositories/missionRepository';
import { createMtTaskRepository } from '../data/repositories/mtTaskRepository';
import { createAwardRepository } from '../data/repositories/awardRepository';
import { createPracticeRepository } from '../data/repositories/practiceRepository';
import { createPaperRepository } from '../data/repositories/paperRepository';
import { createLabRepository } from '../data/repositories/labRepository';
import { createStrategyRepository } from '../data/repositories/strategyRepository';
import { createBacktestRepository } from '../data/repositories/backtestRepository';
import { createDatasetSource } from '../data/market/datasetSource';
import { createMarketDataRepository } from '../data/repositories/marketDataRepository';
import { createProviderDataService } from '../data/market/providerDataService';
import type { MarketDataProvider } from '../data/market/provider';
import type { DatasetFileGateway } from '../data/files/datasetFiles';
import type { SecretStore } from '../data/secure/types';
import { createUnsupportedOnDeviceModel, type CloudCoachTransport } from '../data/coach/types';
import { createPlanRepository } from '../data/repositories/planRepository';
import { createJournalRepository } from '../data/repositories/journalRepository';
import type { JournalFileGateway } from '../data/files/journalFiles';
import { createProfileRepository } from '../data/repositories/profileRepository';
import type { Container } from '../features/app';
import { createId } from '../shared/ids';
import type { Clock } from '../shared/time';

interface ContainerInput {
  readonly db: SqlDatabase;
  readonly content: ContentRepository;
  readonly clock: Clock;
  readonly appVersion: string;
  readonly backupFiles: BackupFileGateway;
  readonly reminders: ReminderGateway;
  readonly taskNotifications: TaskNotificationGateway;
  readonly apps: AppLauncher;
  readonly journalFiles: JournalFileGateway;
  readonly secrets: SecretStore;
  readonly datasetFiles: DatasetFileGateway;
  readonly marketProvider: MarketDataProvider;
  readonly cloudCoach: CloudCoachTransport;
}

export function createContainer({ db, content, clock, appVersion, backupFiles, reminders, taskNotifications, apps, journalFiles, secrets, datasetFiles, marketProvider, cloudCoach }: ContainerInput): Container {
  const bus = createChangeBus();
  const newId = (prefix: string) => createId(prefix, clock.now().getTime());
  const marketData = createMarketDataRepository(db, bus, newId);
  const settings = createSettingsRepository(db, bus);
  return {
    appVersion,
    clock,
    bus,
    content,
    settings,
    contentVersion: createContentVersionRepository(db),
    backup: createBackupService(db, bus, appVersion),
    backupFiles,
    profile: createProfileRepository(db, bus),
    learning: createLearningRepository(db, bus, newId),
    missions: createMissionRepository(db, bus),
    mtTasks: createMtTaskRepository(db, bus, newId),
    awards: createAwardRepository(db, bus),
    practice: createPracticeRepository(db, bus, newId),
    paper: createPaperRepository(db, bus, newId),
    plan: createPlanRepository(db, bus),
    labs: createLabRepository(db, bus, newId),
    strategies: createStrategyRepository(db, bus),
    backtests: createBacktestRepository(db, bus, newId),
    datasets: createDatasetSource(marketData),
    journal: createJournalRepository(db, bus, newId),
    journalFiles,
    reminders,
    taskNotifications,
    apps,
    secrets,
    marketData,
    datasetFiles,
    providerData: createProviderDataService({ provider: marketProvider, secrets, marketData, clock, settings }),
    cloudCoach,
    onDeviceCoach: createUnsupportedOnDeviceModel(),
  };
}
