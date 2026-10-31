import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { completeOnboarding } from '../../features/learning/useCases';
import type { UtcIso } from '../../shared/time';
import { accessibilityProblems, hiddenLabelProblems, type HostNode } from '../../testing/a11y';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { expectSimulatedFiguresBadged, simulatedFigureCount } from '../../testing/simulatedFigures';
import { createTestHarness, TestProviders, TEST_NOW, type TestHarness } from '../../testing/testContainer';
import BackupScreen from '../(tabs)/more/backup';
import MoreScreen from '../(tabs)/more/index';
import ProgressReviewScreen from '../(tabs)/more/progress-review';
import SessionsScreen from '../(tabs)/more/sessions';
import SettingsScreen from '../(tabs)/more/settings';
import OnboardingScreen from '../onboarding';
import ChallengesScreen from '../progress/challenges';
import ProgressScreen from '../progress/index';
import SkillScreen from '../progress/skill/[id]';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

/** Restyle stage 5b: More, settings, sessions clock, progress and the Practice Progress Review. */
let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const NOW = TEST_NOW as UtcIso;
const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const root = () => screen.container as unknown as HostNode;
/** Accessibility checks, and proof that no money figure is shown on these learning screens. */
const checkScreen = () => {
  expect(accessibilityProblems(root())).toEqual([]);
  expect(hiddenLabelProblems(root())).toEqual([]);
  expectSimulatedFiguresBadged(root());
  expect(simulatedFigureCount(root())).toBe(0);
};

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

describe('More', () => {
  it('groups the rows in cards under section titles, each row with an icon well and a chevron', async () => {
    await renderWith(<MoreScreen />);
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('App')).toBeTruthy();
    const row = screen.getByTestId('more-backup');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Backup and restore. Save all your progress to a file');
    await fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/more/backup');
    checkScreen();
  });

  it('settings cards have icon headers and keep every control', async () => {
    await renderWith(<SettingsScreen />);
    for (const title of ['Appearance', 'Explanations', 'Time zone', 'Paper trading', 'Progress', 'Learning reminders']) {
      expect(await screen.findByRole('header', { name: title })).toBeTruthy();
    }
    expect(screen.getByTestId('time-zone')).toBeTruthy();
    checkScreen();
  });
});

describe('Market sessions clock', () => {
  it('draws the 24-hour dial from the injected clock, with a text alternative, and a row per session', async () => {
    await renderWith(<SessionsScreen />);
    const dial = await screen.findByTestId('sessions-dial');
    expect(dial.props.accessibilityRole).toBe('image');
    expect(dial.props.accessibilityLabel).toMatch(/^24-hour sessions dial in your time zone\. Now Thu 11:00\./);
    expect(dial.props.accessibilityLabel).toContain('London, open, 09:00 to 18:00');
    expect(screen.getByTestId('session-london').props.accessibilityLabel).toBe('London. Open until Thu 18:00 · Home currencies: GBP, EUR, CHF. Open');
    expect(screen.getByTestId('session-tokyo')).toHaveTextContent(/Closed/);
    checkScreen();
  });
});

describe('Progress', () => {
  it('shows skills as bars once they have a score, a badge grid with words and icons, and the module timeline', async () => {
    await onboard();
    await harness.container.learning.recordAttempts(
      [{ kind: 'lesson_check', refId: 'fx-position-sizing', answers: { 'fx-position-sizing-q1': ['z'], 'fx-position-sizing-q2': ['z'], 'fx-position-sizing-q3': ['z'] }, score: 0, passed: false }],
      NOW,
    );
    await renderWith(<ProgressScreen />);
    expect(await screen.findByTestId('progress-modules')).toBeTruthy();
    expect(screen.getByTestId('timeline-forex-basics').props.accessibilityLabel).toMatch(/^1\. .+\. Not started · \d+ lessons$/);
    // Too early to tell: no bar, so an empty track never reads as 0%.
    expect(screen.queryByTestId('skill-psychology-fill')).toBeNull();
    expect(screen.getByTestId('skill-psychology').props.accessibilityLabel).toMatch(/Not started\. No evidence yet\.$/);
    expect(screen.getByTestId('badge-disciplined_simulator').props.accessibilityLabel).toMatch(/^Disciplined Simulator\. Not earned yet\. /);
    expect(screen.getAllByText('Not earned yet').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('skill-risk_management'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/progress/skill/[id]', params: { id: 'risk_management' } });
    checkScreen();
  });

  async function seedRiskMisses() {
    const r = await harness.container.learning.recordAttempts(
      [
        { kind: 'lesson_check', refId: 'fx-position-sizing', answers: { 'fx-position-sizing-q1': ['z'], 'fx-position-sizing-q2': ['z'], 'fx-position-sizing-q3': ['z'] }, score: 0, passed: false },
        { kind: 'checkpoint', refId: 'forex-risk-checkpoint', answers: { 'forex-risk-checkpoint-q1': ['z'], 'forex-risk-checkpoint-q2': ['z'] }, score: 0, passed: false },
      ],
      NOW,
    );
    if (!r.ok) throw new Error(r.error.message);
  }

  it('a skill with a score shows its bar', async () => {
    await seedRiskMisses();
    await renderWith(<ProgressScreen />);
    expect(await screen.findByTestId('skill-risk_management-fill')).toBeTruthy();
    // Not enrolled in a program: no module timeline.
    expect(screen.queryByTestId('progress-modules')).toBeNull();
    checkScreen();
  });

  it('the skill page keeps its texts with the bar and icon header', async () => {
    await seedRiskMisses();
    searchParams.current = { id: 'risk_management' };
    await renderWith(<SkillScreen />);
    expect((await screen.findByTestId('skill-level')).props.children).toBe('Developing · 0%');
    checkScreen();
  });

  it('challenges sit in one list card with icon wells', async () => {
    await renderWith(<ChallengesScreen />);
    expect(await screen.findByTestId('challenges-screen')).toBeTruthy();
    checkScreen();
  });
});

describe('Practice Progress Review', () => {
  it('has one card per area with a text verdict, and no "ready" badge or celebration', async () => {
    await harness.container.learning.recordReviewSession(
      { kind: 'checkpoint', refId: 'forex-basics-checkpoint', answers: { 'fxb-cp-1': ['a'], 'fxb-cp-2': ['a'], 'fxb-cp-3': ['a'], 'fxb-cp-4': ['b'], 'fxb-cp-5': ['a', 'b'] }, score: 1, passed: true },
      [],
      NOW,
    );
    await renderWith(<ProgressReviewScreen />);
    expect(await screen.findByTestId('review-verdict-objectives')).toHaveTextContent(/^1 of \d+ module checkpoints passed so far\.$/);
    for (const area of ['objectives', 'calculations', 'conditions', 'gaps']) expect(screen.getByTestId(`review-area-${area}`)).toBeTruthy();
    // The rules card always carries `review-rules` (flow 11 scrolls to it), even with no checked trades.
    expect(screen.getByTestId('review-rules')).toHaveTextContent(/Following your rules/);
    expect(screen.getByTestId('review-verdict-rules')).toHaveTextContent('No checked trades yet.');
    expect(screen.getByText('Learning objectives')).toBeTruthy();
    // "Ready" appears only in the closing reminder, which says practice does NOT show readiness.
    expect(screen.queryByText(/^\s*ready\s*$/i)).toBeNull();
    for (const n of screen.queryAllByText(/\bready\b/i)) expect(String(n.props.children)).toMatch(/does not show that you are ready/);
    expect(screen.queryByText(/congratulations|well done|🎉/i)).toBeNull();
    checkScreen();
  });
});

describe('Practice Progress Review with checked trades', () => {
  it('says the rule count once, in the verdict; the detail adds stops and reviews', async () => {
    const r = await harness.container.journal.add(
      {
        source: 'manual', sourceRef: null, externalId: null, market: 'forex', instrument: 'EURUSD', direction: 'buy', strategy: null, entry: '1.1', stop: '1.09', target: null,
        size: '0.1', sizeUnit: 'lots', exit: '1.09', pnlMoney: '-100', pnlPips: null, pnlR: '-1', plannedRisk: '100', costs: null, equityAtEntry: '10000', openedAt: null, closedAt: null,
        conditions: null, entryRationale: 'Retest', exitRationale: null, emotion: null, ruleViolations: [], noteBefore: null, noteAfter: null, screenshotUri: null, processScore: 0.8,
      },
      NOW,
    );
    if (!r.ok) throw new Error(r.error.message);
    await renderWith(<ProgressReviewScreen />);
    expect(await screen.findByTestId('review-verdict-rules')).toHaveTextContent('1 of 1 checked trade broke no rule.');
    expect(screen.getByTestId('review-rules-detail')).toHaveTextContent('1 had a stop. 0 were reviewed in the journal.');
    expect(screen.getByTestId('review-rules-detail')).not.toHaveTextContent(/broke no rule/);
    checkScreen();
  });
});

describe('Backup', () => {
  it('shows the export outcome above the cards, so it is on screen without scrolling', async () => {
    await renderWith(<BackupScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Create backup file' }));
    const created = await screen.findByText('Backup created');
    const order = (screen.container as unknown as HostNode).queryAll((n) => n.type === 'Text').map((n) => (n.children as unknown[]).join(''));
    expect(order.indexOf('Backup created')).toBeLessThan(order.indexOf('Back up'));
    expect(created).toBeTruthy();
    checkScreen();
  });
});

describe('Onboarding', () => {
  it('keeps "Step 1 of 8" in words beside the step bar', async () => {
    await renderWith(<OnboardingScreen />);
    expect(await screen.findByText('Step 1 of 8')).toBeTruthy();
    expect(screen.getByText('Simulation and demo only')).toBeTruthy();
    checkScreen();
  });
});
