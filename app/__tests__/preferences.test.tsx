import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { completeOnboarding } from '../../features/learning/useCases';
import { accessibilityProblems, hiddenLabelProblems, type HostNode } from '../../testing/a11y';
import { resetRouterMock, routerMock as router } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import LearnScreen from '../(tabs)/learn/index';
import ProgramsScreen from '../(tabs)/learn/programs';
import PreferencesScreen from '../(tabs)/more/preferences';
import SettingsScreen from '../(tabs)/more/settings';
import StrategiesScreen from '../(tabs)/strategies/index';
import OnboardingScreen from '../onboarding';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

/** Settings → What I want to learn, and the suggestions that follow the saved choices. */
let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

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
  return r.value;
}

const profile = async () => {
  const r = await harness.container.profile.get();
  if (!r.ok || !r.value) throw new Error('no profile');
  return r.value;
};

describe('Settings → What I want to learn', () => {
  it('Settings links to the preferences screen', async () => {
    await renderWith(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('settings-preferences'));
    expect(router.push).toHaveBeenCalledWith('/more/preferences');
  });

  it('shows the saved answers, saves new ones and keeps the program under way', async () => {
    const enrolment = await onboard();
    await renderWith(<PreferencesScreen />);
    expect(await screen.findByTestId('preferences-suggestion')).toHaveTextContent(/Practical Forex Trader/);
    expect(accessibilityProblems(root())).toEqual([]);
    expect(hiddenLabelProblems(root())).toEqual([]);

    await fireEvent.press(screen.getByTestId('pref-market-forex'));
    await fireEvent.press(screen.getByTestId('pref-market-stocks'));
    await fireEvent.press(screen.getByTestId('pref-goal-risk_management'));
    await fireEvent.press(screen.getByTestId('pref-experience-have_traded'));
    await fireEvent.press(screen.getByText('Save my choices'));

    expect(await screen.findByTestId('preferences-message')).toHaveTextContent(/Saved/);
    expect(await profile()).toMatchObject({ experience: 'have_traded', markets: ['stocks'], goals: ['understand_markets', 'risk_management'] });
    expect(await screen.findByTestId('preferences-suggestion')).toHaveTextContent(/Trader Development/);
    const enrolments = await harness.container.learning.enrolments();
    expect(enrolments.ok && enrolments.value).toEqual([enrolment]);
  });

  it('will not save with no market chosen', async () => {
    await onboard();
    await renderWith(<PreferencesScreen />);
    await fireEvent.press(await screen.findByTestId('pref-market-forex'));
    await fireEvent.press(screen.getByText('Save my choices'));
    expect(screen.queryByTestId('preferences-message')).toBeNull();
    expect((await profile()).markets).toEqual(['forex']);
  });
});

describe('suggestions follow the saved choices', () => {
  it('Programs marks the best-fit program', async () => {
    await onboard();
    await renderWith(<ProgramsScreen />);
    expect(await screen.findByTestId('program-suggested-practical-forex-trader')).toBeTruthy();
    expect(screen.queryByTestId('program-suggested-trader-development')).toBeNull();
  });

  it('Learn marks matching modules in words', async () => {
    await onboard();
    await renderWith(<LearnScreen />);
    expect(await screen.findByTestId('module-match-forex-orders')).toHaveTextContent('For you · Matches your choices: Forex, Understand markets');
  });

  it('Strategies tags pages on the learner markets', async () => {
    await onboard();
    await renderWith(<StrategiesScreen />);
    const forex = await screen.findByTestId('strategy-carry-concept');
    expect(forex).toHaveTextContent(/For you/);
  });
});

describe('onboarding', () => {
  const press = async (name: string) => fireEvent.press(await screen.findByRole('button', { name }));
  async function toProgramStep(market: string) {
    await renderWith(<OnboardingScreen />);
    await fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('radio', { name: 'Complete beginner' }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('checkbox', { name: market }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Risk management' }));
    await press('Continue');
    await press('Continue');
    await press('Continue');
  }

  it('starts the program step on the program that fits the answers', async () => {
    await toProgramStep('Ordinary stocks');
    expect(await screen.findByTestId('onboarding-suggested-program')).toHaveTextContent(/Trader Development/);
    expect(screen.getByRole('radio', { name: 'Trader Development' })).toBeSelected();
  });

  it('keeps the first program for a forex learner', async () => {
    await toProgramStep('Forex');
    expect(await screen.findByTestId('onboarding-suggested-program')).toHaveTextContent(/Practical Forex Trader/);
    expect(screen.getByRole('radio', { name: 'Practical Forex Trader' })).toBeSelected();
  });
});
