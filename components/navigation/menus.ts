import type { FeatureName } from '../../shared/featureFlags';
import { BookOpen, ChartCandlestick, Ellipsis, GitBranch, House, NotebookPen, type LucideIcon } from '../ui/icons';

/** A bottom tab (spec §4). `name` is the folder under app/(tabs); its route is `/<name>`. */
export interface TabItem {
  readonly name: string;
  readonly title: string;
  /** Outline Lucide icon; the active tab draws it with a heavier stroke on a tinted pill. */
  readonly icon: LucideIcon;
}

export const TABS: readonly TabItem[] = [
  { name: 'home', title: 'Home', icon: House },
  { name: 'learn', title: 'Learn', icon: BookOpen },
  { name: 'practice', title: 'Practice', icon: ChartCandlestick },
  { name: 'strategies', title: 'Strategies', icon: GitBranch },
  { name: 'journal', title: 'Journal', icon: NotebookPen },
  { name: 'more', title: 'More', icon: Ellipsis },
];

/** A row in the More menu. `href` is a route path; tests check that each resolves to a route file. */
export interface MenuItem {
  readonly feature: FeatureName;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
}

export const MORE_TOOLS: readonly MenuItem[] = [
  { feature: 'progressReview', title: 'Practice Progress Review', subtitle: 'What you have learned and practised, and what to work on', href: '/more/progress-review' },
  { feature: 'tradingPlan', title: 'Trading plan', subtitle: 'Your one-page plan, with every version kept', href: '/more/plan' },
  { feature: 'checklist', title: 'Pre-trade checklist', subtitle: 'Five questions before a demo trade in MetaTrader', href: '/more/checklist' },
  { feature: 'sessions', title: 'Market sessions', subtitle: 'Which forex sessions are open, in your time zone', href: '/more/sessions' },
  { feature: 'coach', title: 'Coach', subtitle: 'Explanations, extra practice and reviews; offline or with your own AI key', href: '/coach' },
  { feature: 'calendar', title: 'Market calendar', subtitle: 'What each kind of event measures, with a sample week', href: '/calendar' },
  { feature: 'newsToLearning', title: 'News to Learning', subtitle: 'Turn a headline you read into study questions', href: '/news' },
  { feature: 'marketData', title: 'Your price data', subtitle: 'Import a CSV file or fetch past prices to chart, replay and backtest', href: '/data' },
  { feature: 'brokerCheck', title: 'Broker check', subtitle: 'Check a firm on its regulator’s own register', href: '/more/broker-check' },
];

export const MORE_APP: readonly MenuItem[] = [
  { feature: 'settings', title: 'Settings', subtitle: 'Appearance and time zone', href: '/more/settings' },
  { feature: 'riskRules', title: 'Risk rules', subtitle: 'Your limits for risk per trade, daily loss, and open positions', href: '/more/risk-rules' },
  { feature: 'services', title: 'Data and AI services', subtitle: 'Optional online services and your keys; all off by default', href: '/more/services' },
  { feature: 'backup', title: 'Backup and restore', subtitle: 'Save all your progress to a file', href: '/more/backup' },
  { feature: 'disclosures', title: 'About and risk', subtitle: 'Risk warnings, content version, data sources', href: '/more/about' },
];

export const MORE_RESEARCH: MenuItem = { feature: 'researchLibrary', title: 'Research Library', subtitle: 'The reviewed sources behind trader and strategy pages', href: '/research' };
