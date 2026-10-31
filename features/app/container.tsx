import { createContext, useContext, type ReactNode } from 'react';
import type {
  AppLauncher,
  AwardRepository,
  BackupFileGateway,
  BackupService,
  ChangeBus,
  ContentRepository,
  ContentVersionRepository,
  LearningRepository,
  MissionRepository,
  MtTaskRepository,
  PracticeRepository,
  PaperRepository,
  PlanRepository,
  LabRepository,
  JournalRepository,
  JournalFileGateway,
  ProfileRepository,
  ReminderGateway,
  TaskNotificationGateway,
  SettingsRepository,
  StrategyRepository,
  BacktestRepository,
  DatasetSource,
  SecretStore,
  MarketDataRepository,
  DatasetFileGateway,
  ProviderDataService,
  CloudCoachTransport,
  OnDeviceModelManager,
} from '../../data';
import type { Clock } from '../../shared/time';

/**
 * Dependencies available to features. Built by `di/createContainer` with real
 * implementations; tests pass fakes (spec §32A.6).
 */
export interface Container {
  readonly appVersion: string;
  readonly clock: Clock;
  readonly bus: ChangeBus;
  readonly settings: SettingsRepository;
  readonly contentVersion: ContentVersionRepository;
  readonly content: ContentRepository;
  readonly backup: BackupService;
  readonly backupFiles: BackupFileGateway;
  readonly profile: ProfileRepository;
  readonly learning: LearningRepository;
  readonly missions: MissionRepository;
  readonly mtTasks: MtTaskRepository;
  readonly awards: AwardRepository;
  readonly practice: PracticeRepository;
  readonly paper: PaperRepository;
  readonly plan: PlanRepository;
  readonly labs: LabRepository;
  readonly strategies: StrategyRepository;
  readonly backtests: BacktestRepository;
  readonly datasets: DatasetSource;
  readonly journal: JournalRepository;
  readonly journalFiles: JournalFileGateway;
  readonly reminders: ReminderGateway;
  /** The optional ongoing MetaTrader task-step notification (spec §11). */
  readonly taskNotifications: TaskNotificationGateway;
  readonly apps: AppLauncher;
  /** The learner's own API keys, in the device's secure storage only (spec §34). */
  readonly secrets: SecretStore;
  readonly marketData: MarketDataRepository;
  readonly datasetFiles: DatasetFileGateway;
  readonly providerData: ProviderDataService;
  readonly cloudCoach: CloudCoachTransport;
  readonly onDeviceCoach: OnDeviceModelManager;
}

const ContainerContext = createContext<Container | null>(null);

export function ContainerProvider({ container, children }: { readonly container: Container; readonly children: ReactNode }) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

export function useContainer(): Container {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('useContainer must be used inside <ContainerProvider>');
  return container;
}
