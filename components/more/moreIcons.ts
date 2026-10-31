import type { FeatureName } from '../../shared/featureFlags';
import type { WellTone } from '../ui/IconWell';
import {
  BookOpen,
  CalendarDays,
  ChartLine,
  ClipboardCheck,
  Clock,
  DatabaseBackup,
  Info,
  KeyRound,
  Library,
  ListChecks,
  Newspaper,
  NotebookPen,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from '../ui/icons';

export interface MenuIcon {
  readonly icon: LucideIcon;
  readonly tone: WellTone;
}

/** The icon well for each More row (brief §5.8: grouped list cards with icon wells). Decoration only. */
const ICONS: Partial<Record<FeatureName, MenuIcon>> = {
  progressReview: { icon: ClipboardCheck, tone: 'brand' },
  tradingPlan: { icon: NotebookPen, tone: 'brand' },
  checklist: { icon: ListChecks, tone: 'brand' },
  sessions: { icon: Clock, tone: 'info' },
  coach: { icon: Sparkles, tone: 'info' },
  calendar: { icon: CalendarDays, tone: 'info' },
  newsToLearning: { icon: Newspaper, tone: 'info' },
  marketData: { icon: ChartLine, tone: 'info' },
  brokerCheck: { icon: ShieldCheck, tone: 'warning' },
  settings: { icon: Settings, tone: 'neutral' },
  riskRules: { icon: Target, tone: 'neutral' },
  services: { icon: KeyRound, tone: 'neutral' },
  backup: { icon: DatabaseBackup, tone: 'neutral' },
  disclosures: { icon: Info, tone: 'neutral' },
  researchLibrary: { icon: Library, tone: 'brand' },
};

const FALLBACK: MenuIcon = { icon: BookOpen, tone: 'neutral' };

export function menuIcon(feature: FeatureName): MenuIcon {
  return ICONS[feature] ?? FALLBACK;
}
