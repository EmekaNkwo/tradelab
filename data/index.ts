/**
 * Public data-layer interfaces for features. Implementations are wired up in
 * `di/` (the composition root), never imported directly by features or UI.
 */
export type { ChangeBus } from './db/changeBus';
export type { BackupService, PreparedBackup } from './backup/backupService';
export type { BackupFileGateway } from './backup/backupFiles';
export type { BackupFile, BackupSummary } from './backup/format';
export type { ContentRepository, QuestionInfo } from './content/contentLoader';
export type { ContentVersionRepository, InstalledContentVersion } from './repositories/contentVersionRepository';
export type { SettingsRepository } from './repositories/settingsRepository';
export type { AppLauncher, LaunchResult, MetaTraderApp } from './apps/types';
export type { TaskNotificationGateway, TaskNoticeOutcome, TaskStepNotice } from './reminders/taskNotification';
export type { ReminderGateway, ReminderKind, ReminderPlan, ReminderSyncOptions, ReminderSyncOutcome, WeeklySlot } from './reminders/types';
export type { ProfileRepository } from './repositories/profileRepository';
export type { ClassCompletion, EnrolInput, EnrolmentPatch, LearningRepository, LessonResult } from './repositories/learningRepository';
export type { MissionRepository } from './repositories/missionRepository';
export type { MetaTraderTaskCompletionInput, MtTaskRepository, StoredTaskDraft } from './repositories/mtTaskRepository';
export type { AwardRepository, AwardUnlock, AwardUnlockKind } from './repositories/awardRepository';
export type { DrillAttemptInput, DrillTally, PracticeRepository, ReplayAttemptInput } from './repositories/practiceRepository';
export { MAX_REPLAY_NOTE_LENGTH } from './repositories/practiceRepository';
export type { PaperAccount, PaperAccountInput, PaperRepository } from './repositories/paperRepository';
export { MAX_ACCOUNT_NAME_LENGTH } from './repositories/paperRepository';
export type { PlanRepository } from './repositories/planRepository';
export type { LabRepository } from './repositories/labRepository';
export type { StrategyRepository } from './repositories/strategyRepository';
export type { BacktestRepository, BacktestRun, PlaybookEntry, PlaybookInput, SaveVersionInput, StrategyVersion } from './repositories/backtestRepository';
export { MAX_PLAYBOOK_TEXT, MAX_STRATEGY_NAME, MAX_VERSION_NOTE } from './repositories/backtestRepository';
export type { RunInputs, StoredResult } from './repositories/backtestSchemas';
export type { DatasetSource } from './market/datasetSource';
export type { AddManyResult, JournalEntryInput, JournalNotesPatch, JournalRepository } from './repositories/journalRepository';
export { MAX_JOURNAL_TEXT } from './repositories/journalRepository';
export type { JournalFileGateway } from './files/journalFiles';
export { MAX_TASK_NOTE_LENGTH } from './repositories/mtTaskRepository';
export type { SecretName, SecretStore } from './secure/types';
export { cleanSecret, SECRET_LABELS, SECRET_NAMES } from './secure/types';
export type { CachedProviderDataset, MarketDataRepository, NewDataset } from './repositories/marketDataRepository';
export type { DatasetFileGateway } from './files/datasetFiles';
export type { MarketDataProvider, ProviderRow, ProviderSeries, ProviderSeriesRequest } from './market/provider';
export type { ProviderDataService, ProviderFetchOutcome, ProviderFetchRequest } from './market/providerDataService';
export { createRateLimiter, LOCAL_DATE_NOTE, PROVIDER_CACHE_HOURS, requestKey } from './market/providerDataService';
export type { CloudCoachRequest, CloudCoachResponse, CloudCoachTransport, OnDeviceModelManager, OnDeviceModelStatus } from './coach/types';
