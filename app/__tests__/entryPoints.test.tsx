import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { completeOnboarding } from '../../features/learning/useCases';
import { type FeatureName } from '../../shared/featureFlags';
import { featuresForRoute, isRouteEnabled } from '../../shared/routeAccess';
import { pressEverything, settle, targetPath, type HostNode } from '../../testing/a11y';
import { resetFeatureFlags, turnFeaturesOff } from '../../testing/featureFlagSeam';
import { resetRouterMock, routerMock, searchParams } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import HomeScreen from '../(tabs)/home/index';
import LearnScreen from '../(tabs)/learn/index';
import MoreScreen from '../(tabs)/more/index';
import PracticeScreen from '../(tabs)/practice/index';
import StrategiesScreen from '../(tabs)/strategies/index';
import BacktestScreen from '../backtest/index';
import CalendarScreen from '../calendar/index';
import CoachScreen from '../coach';
import DataScreen from '../data/index';
import LabsScreen from '../labs/index';
import ConceptScreen from '../labs/concept/[id]';
import LessonScreen from '../lesson/[id]';
import NewsScreen from '../news';
import PortfolioScreen from '../portfolio/index';
import ProgressScreen from '../progress/index';
import StrategyScreen from '../strategy/[id]';

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
  const base = jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule();
  const Tabs = Object.assign(({ children }: { children: ReactElement }) => children, {
    Screen: ({ name, options }: { name: string; options: { href?: null } }) => <T>{`tab:${name}:${options.href === null ? 'hidden' : 'shown'}`}</T>,
  });
  return { ...base, Tabs };
});
jest.mock('../../shared/featureFlags', () =>
  jest.requireActual<typeof import('../../testing/featureFlagSeam')>('../../testing/featureFlagSeam').createFeatureFlagsModule(),
);

let harness: TestHarness;
beforeEach(() => resetRouterMock());
afterEach(() => resetFeatureFlags());

/** One database for a describe block; screens that write to it get a fresh one per test. */
function useHarness(scope: 'all' | 'each') {
  const [before, after] = scope === 'all' ? [beforeAll, afterAll] : [beforeEach, afterEach];
  before(async () => {
    harness = await createTestHarness();
  });
  after(() => harness.db.close());
}

async function onboard(h: TestHarness) {
  const r = await completeOnboarding(h.container, {
    riskAcknowledged: true,
    experience: 'complete_beginner',
    markets: ['forex'],
    goals: ['understand_markets'],
    explanationLevel: 'simple',
    metaTrader: null,
    timeZone: 'Africa/Lagos',
    programId: 'practical-forex-trader',
    settings: { startDate: '2026-10-29' as never, timeline: { kind: 'weeks', weeks: 4 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
    classTime: null,
    remindersEnabled: false,
    placementPassedModuleIds: [],
  });
  if (!r.ok) throw new Error('onboarding failed');
}

interface EntryScreen {
  readonly name: string;
  /** The screen's own route: its own features are not "entry points" from here. */
  readonly route: string;
  readonly ui: () => ReactElement;
  readonly params?: Record<string, string>;
  readonly onboarded?: boolean;
  /** Per-test timeout for screens whose crawl presses many controls (the UI default is 15 s). */
  readonly timeoutMs?: number;
}

/** The Learn crawl presses every row and tool card, once per feature flag it reaches: about 3.5 s unloaded. */
const SLOW_CRAWL_TIMEOUT_MS = 45_000;

const SCREENS: readonly EntryScreen[] = [
  { name: 'Home', route: '/home', ui: () => <HomeScreen />, onboarded: true },
  { name: 'Learn', route: '/learn', ui: () => <LearnScreen />, timeoutMs: SLOW_CRAWL_TIMEOUT_MS },
  { name: 'Practice', route: '/practice', ui: () => <PracticeScreen /> },
  { name: 'Strategies', route: '/strategies', ui: () => <StrategiesScreen /> },
  { name: 'More', route: '/more', ui: () => <MoreScreen /> },
  { name: 'Progress', route: '/progress', ui: () => <ProgressScreen />, onboarded: true },
  { name: 'Strategy page', route: '/strategy/[id]', ui: () => <StrategyScreen />, params: { id: 'channel-breakout' } },
  { name: 'Analysis labs', route: '/labs', ui: () => <LabsScreen /> },
  { name: 'Lab concept', route: '/labs/concept/[id]', ui: () => <ConceptScreen />, params: { id: 'ta-false-breakouts' } },
  { name: 'Lesson', route: '/lesson/[id]', ui: () => <LessonScreen />, params: { id: 'fx-breakouts' } },
  { name: 'Calendar', route: '/calendar', ui: () => <CalendarScreen /> },
  { name: 'News', route: '/news', ui: () => <NewsScreen /> },
  { name: 'Coach', route: '/coach', ui: () => <CoachScreen /> },
  { name: 'Price data', route: '/data', ui: () => <DataScreen /> },
  { name: 'Backtesting Lab', route: '/backtest', ui: () => <BacktestScreen /> },
  { name: 'Portfolio', route: '/portfolio', ui: () => <PortfolioScreen /> },
];

/** Renders the screen, presses everything on it, and returns every route it navigated to. */
async function crawl(s: EntryScreen): Promise<string[]> {
  resetRouterMock();
  searchParams.current = { ...(s.params ?? {}) };
  const view = await render(<TestProviders container={harness.container}>{s.ui()}</TestProviders>);
  await settle(6);
  await pressEverything(() => view.container as unknown as HostNode);
  const targets = [...routerMock.push.mock.calls, ...routerMock.replace.mock.calls].map((c) => targetPath(c[0]));
  await view.unmount();
  return targets;
}

describe('entry points to a switched-off feature are hidden', () => {
  useHarness('each');
  const checkScreen = async (s: EntryScreen) => {
    if (s.onboarded) await onboard(harness);
    const own = new Set(featuresForRoute(s.route) ?? []);
    const baseline = await crawl(s);
    expect(baseline.length).toBeGreaterThan(0);
    const flags = [...new Set(baseline.flatMap((t) => featuresForRoute(t) ?? []))].filter((f) => !own.has(f)) as FeatureName[];
    for (const flag of flags) {
      turnFeaturesOff(flag);
      const targets = await crawl(s);
      const leaks = targets.filter((t) => !isRouteEnabled(t));
      expect({ flag, leaks }).toEqual({ flag, leaks: [] });
      resetFeatureFlags();
    }
  };
  for (const s of SCREENS) {
    it(s.name, () => checkScreen(s), s.timeoutMs);
  }
});

describe('Home with the learning features off', () => {
  useHarness('each');

  it('still renders, without links to the class, the review or the program timeline', async () => {
    await onboard(harness);
    turnFeaturesOff('learn', 'programs');
    const view = await render(
      <TestProviders container={harness.container}>
        <HomeScreen />
      </TestProviders>,
    );
    await settle(6);
    expect(view.queryByText(/Start today's class|Continue today's class/)).toBeNull();
    expect(view.queryByRole('button', { name: 'Review earlier concepts' })).toBeNull();
    expect(view.queryByRole('button', { name: /Timeline and settings|Catch up/ })).toBeNull();
    expect(view.getByText('You have not made a backup yet.')).toBeTruthy();
    await pressEverything(() => view.container as unknown as HostNode);
    const targets = [...routerMock.push.mock.calls, ...routerMock.replace.mock.calls].map((c) => targetPath(c[0]));
    expect(targets.filter((t) => !isRouteEnabled(t))).toEqual([]);
  });
});
