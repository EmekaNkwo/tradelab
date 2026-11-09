import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { completeOnboarding } from '../../features/learning/useCases';
import { newPaperState, paperCandles } from '../../features/paper/paperSession';
import { practiceInstrument } from '../../features/paper';
import type { UtcIso } from '../../shared/time';
import { accessibilityProblems, settle, type HostNode } from '../../testing/a11y';
import { resetFeatureFlags, turnFeaturesOff } from '../../testing/featureFlagSeam';
import { resetRouterMock, routerMock, searchParams } from '../../testing/routerMock';
import { expectSimulatedFiguresBadged } from '../../testing/simulatedFigures';
import { createTestHarness, movableClock, TestProviders, type TestHarness } from '../../testing/testContainer';
import { TodayHero } from '../../components/home/TodayHero';
import type { LearningHome } from '../../features/learning';
import HomeScreen from '../(tabs)/home/index';
import PracticeScreen from '../(tabs)/practice/index';
import PaperAccountScreen from '../(tabs)/practice/paper/[id]';
import PaperAccountsScreen from '../(tabs)/practice/paper/index';
import PortfolioScreen from '../portfolio/index';
import SandboxScreen from '../portfolio/sandbox';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());
jest.mock('../../shared/featureFlags', () =>
  jest.requireActual<typeof import('../../testing/featureFlagSeam')>('../../testing/featureFlagSeam').createFeatureFlagsModule(),
);

/** Restyle stage 3: Home (brief §5.1) and Practice (§5.3) show only real data, gate their links, and badge simulated money. */
let harness: TestHarness;
let clock: ReturnType<typeof movableClock>;
beforeEach(async () => {
  clock = movableClock();
  harness = await createTestHarness(undefined, clock);
  resetRouterMock();
});
afterEach(() => {
  resetFeatureFlags();
  harness.db.close();
});

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const root = () => screen.container as unknown as HostNode;

async function onboard() {
  const r = await completeOnboarding(harness.container, {
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

async function paperAccount(name = 'Practice'): Promise<string> {
  const instrument = practiceInstrument('sim-eurusd')!;
  const state = newPaperState(instrument, paperCandles(instrument, 'range', 7, 'H1'), 7, '10000');
  if (!state.ok) throw new Error(state.error.message);
  const a = await harness.container.paper.create({ name, instrumentId: instrument.id, scenarioKind: 'range', seed: 7, timeframe: 'H1', startingBalance: '10000', state: state.value }, NOW);
  if (!a.ok) throw new Error(a.error.message);
  return a.value.id;
}

describe('Home', () => {
  it('greets by the device clock in the learner’s zone, with no name and a neutral avatar', async () => {
    await onboard();
    await renderWith(<HomeScreen />);
    // 10:00 UTC is 11:00 in Lagos.
    expect(await screen.findByTestId('home-greeting')).toHaveTextContent('Good morning', { exact: true });
    expect(within(screen.getByTestId('home-avatar', { includeHiddenElements: true })).queryByText(/\w/, { includeHiddenElements: true })).toBeNull();
    await screen.unmount();
    clock.set('2026-10-29T17:30:00.000Z');
    await renderWith(<HomeScreen />);
    expect(await screen.findByTestId('home-greeting')).toHaveTextContent('Good evening');
  });

  it('shows the bell dot only while a class is due, and the hero with the class place and progress', async () => {
    await onboard();
    await renderWith(<HomeScreen />);
    expect(await screen.findByTestId('home-bell-dot')).toBeTruthy();
    expect(screen.getByTestId('home-bell')).toHaveProp('accessibilityLabel', "Reminders: today's class is waiting");
    expect(screen.getByTestId('today-meta')).toHaveTextContent(/^Class 1 of \d+ · about 15 minutes$/);
    expect(screen.getByLabelText(/^Program progress, 0 percent\. Finishes /)).toBeTruthy();
    expect(screen.getByRole('button', { name: "Start today's class" })).toBeTruthy();
    expectSimulatedFiguresBadged(root());
  });

  it('has no bell dot when nothing is due', async () => {
    await renderWith(<HomeScreen />);
    // Without a profile Home redirects to onboarding; the header is never shown with a guessed state.
    expect(await screen.findByText('redirect:/onboarding')).toBeTruthy();
    expect(screen.queryByTestId('home-bell-dot')).toBeNull();
  });

  it('counts this week from the records, with changes against last week', async () => {
    await onboard();
    await renderWith(<HomeScreen />);
    const classes = await screen.findByTestId('home-week-classes');
    expect(classes).toHaveTextContent(/^Classes attended0/);
    expect(screen.getByTestId('home-week-quiz')).toHaveTextContent(/–/);
    expect(screen.getByLabelText('Quiz accuracy this week so far, no questions answered yet')).toBeTruthy();
    expect(screen.getByLabelText('Classes attended vs same point last week, no change, 0')).toBeTruthy();
  });

  it('quick actions open only routes the learner can open', async () => {
    await onboard();
    await renderWith(<HomeScreen />);
    await fireEvent.press(await screen.findByTestId('home-action-class'));
    expect(routerMock.push).toHaveBeenLastCalledWith(expect.stringMatching(/^\/class\//));
    await fireEvent.press(screen.getByTestId('home-action-chart-lab'));
    expect(routerMock.push).toHaveBeenLastCalledWith('/practice/chart-lab', { withAnchor: true });
    await screen.unmount();

    turnFeaturesOff('practice', 'learn');
    await renderWith(<HomeScreen />);
    await screen.findByTestId('home-actions');
    expect(screen.queryByTestId('home-action-class')).toBeNull();
    expect(screen.queryByTestId('home-action-chart-lab')).toBeNull();
    expect(screen.queryByTestId('home-action-calculator')).toBeNull();
    expect(screen.getByTestId('home-action-more')).toBeTruthy();
  });

  it('hides the week tiles when the progress dashboard is off', async () => {
    await onboard();
    turnFeaturesOff('progressDashboard');
    await renderWith(<HomeScreen />);
    await screen.findByTestId('today-hero');
    await settle(4);
    expect(screen.queryByTestId('home-week')).toBeNull();
  });
});

describe("Today's hero states", () => {
  const base = { programTitle: 'P', today: '2026-10-29', classes: [], todaysClass: null, nextClass: null, status: { kind: 'on_track' }, completedUnits: 2, totalUnits: 4, finishDate: '2026-11-20', dueReviews: 0, missions: null, newUnits: 0 };
  const home = (over: object) => ({ ...base, ...over }) as unknown as LearningHome;
  const enrolment = { id: 'e', status: 'active', settings: {} };

  it('says when there is no program, or it is paused', async () => {
    await renderWith(<TodayHero home={home({ enrolment: null })} />);
    expect(screen.getByText('No active program')).toBeTruthy();
    await screen.unmount();
    await renderWith(<TodayHero home={home({ enrolment: { ...enrolment, status: 'paused' } })} />);
    expect(screen.getByRole('button', { name: 'Resume program' })).toBeTruthy();
  });

  it("shows a done class with tomorrow's preview, and a finished program", async () => {
    const next = { id: 'n', date: '2026-10-30', moduleId: null };
    await renderWith(<TodayHero home={home({ enrolment, classes: [next], nextClass: next })} />);
    expect(screen.getByText("Today's class is done")).toBeTruthy();
    expect(screen.getByText(/^Next class: /)).toBeTruthy();
    expect(screen.getByLabelText(/^Program progress, 50 percent\. Finishes /)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start the next class early' })).toBeTruthy();
    await screen.unmount();
    await renderWith(<TodayHero home={home({ enrolment, classes: [next], finishDate: null })} />);
    expect(screen.getByText('Program complete')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('labels a checkpoint or review class and an overdue date', async () => {
    const cls = { id: 'c', date: '2026-10-27', kind: 'checkpoint', status: 'in_progress', minutes: 20, moduleId: null };
    await renderWith(<TodayHero home={home({ enrolment, classes: [cls], todaysClass: cls })} />);
    expect(screen.getByText('Checkpoint class')).toBeTruthy();
    expect(screen.getByText(/^Planned for /)).toBeTruthy();
    expect(screen.getByRole('button', { name: "Continue today's class" })).toBeTruthy();
    await screen.unmount();
    await renderWith(<TodayHero home={home({ enrolment, classes: [], todaysClass: { ...cls, kind: 'review', date: '2026-10-29' } })} />);
    expect(screen.getByText('Review class')).toBeTruthy();
    expect(screen.getByTestId('today-meta')).toHaveTextContent('about 20 minutes', { exact: true });
  });
});

describe('Practice', () => {
  it('opens the tools from quick actions, gates them, and badges the screen', async () => {
    await renderWith(<PracticeScreen />);
    await fireEvent.press(await screen.findByTestId('practice-paper'));
    expect(routerMock.push).toHaveBeenLastCalledWith('/practice/paper');
    await fireEvent.press(screen.getByTestId('practice-metatrader'));
    expect(routerMock.push).toHaveBeenLastCalledWith('/learn/metatrader');
    expect(screen.getByLabelText('Simulated money, not real')).toBeTruthy();
    await screen.unmount();
    turnFeaturesOff('paper', 'learn');
    await renderWith(<PracticeScreen />);
    await screen.findByTestId('practice-replay');
    expect(screen.queryByTestId('practice-paper')).toBeNull();
    expect(screen.queryByTestId('practice-metatrader')).toBeNull();
  });

  it('the paper account shows equity in a Paper hero, keeps reset in a menu, and lists results with sign and arrow', async () => {
    const id = await paperAccount('Hero test');
    searchParams.current = { id };
    await renderWith(<PaperAccountScreen />);
    expect(await screen.findByText('Hero test')).toBeTruthy();
    expect(screen.getByTestId('paper-equity')).toHaveTextContent('10,000.00 USD');
    expect(screen.getByTestId('paper-equity')).toHaveProp('accessibilityLabel', 'Equity, paper account, 10,000.00 USD, no change 0.0% since the start');
    expect(screen.queryByRole('button', { name: 'Reset account' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Account options' }));
    expect(screen.getByRole('button', { name: 'Reset account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 8 });

    // A trade without a stop: no planned risk, so no R is shown.
    await fireEvent.changeText(screen.getByTestId('paper-size'), '0.1');
    await fireEvent.press(screen.getByRole('button', { name: 'Check against my risk rules' }));
    const answer = (item: string, name: string) => within(screen.getByTestId(`checklist-${item}`)).getByRole('radio', { name });
    await fireEvent.press(answer('in_plan', 'Yes'));
    await fireEvent.press(answer('news_soon', 'No'));
    await fireEvent.press(answer('calm', 'Yes'));
    await fireEvent.press(screen.getByRole('button', { name: 'Place anyway (recorded as a rule break)' }));
    await waitFor(() => expect(screen.getByTestId('paper-order')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Next candle' }));
    await waitFor(() => expect(screen.getByTestId('paper-position')).toBeTruthy());
    expect(screen.getByText(/^Buy 0\.1 lots at /)).toBeTruthy();
    expect(screen.getByLabelText(/^Margin, paper, [\d,]+\.\d\d USD/)).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 10 });
    await fireEvent.press(screen.getByRole('button', { name: /^Close position/ }));
    const row = await screen.findByTestId('paper-history-item');
    expect(row).toHaveTextContent(/^Buy EUR\/USD · 0\.1 lots/);
    expect(row.props.accessibilityLabel).toMatch(/Paper, Result, (gain of|loss of|no gain or loss,) [\d,]+\.\d\d USD$/);
    expect(row).not.toHaveTextContent(/R$/);
    expectSimulatedFiguresBadged(root(), { atLeast: 9 });
    expect(accessibilityProblems(root())).toEqual([]);
  });

  it('the accounts list and the portfolio badge every simulated figure', async () => {
    await paperAccount('One');
    await renderWith(<PaperAccountsScreen />);
    expect(await screen.findByTestId('paper-account-row')).toHaveTextContent(/10,000\.00 USD/);
    expect(screen.getByText('Paper trading — simulated')).toBeTruthy();
    expectSimulatedFiguresBadged(root(), { atLeast: 1 });
    await screen.unmount();

    await renderWith(<PortfolioScreen />);
    expect(await screen.findByTestId('portfolio-equity')).toBeTruthy();
    expect(screen.getByTestId('portfolio-hero')).toBeTruthy();
    expect(screen.getAllByTestId('portfolio-account')).toHaveLength(1);
    expectSimulatedFiguresBadged(root(), { atLeast: 3 });
    await screen.unmount();

    await renderWith(<SandboxScreen />);
    await screen.findByTestId('sandbox-beat');
    expect(screen.getAllByLabelText('Simulated money, not real').length).toBeGreaterThanOrEqual(2);
    expectSimulatedFiguresBadged(root(), { atLeast: 3 });
  });
});
