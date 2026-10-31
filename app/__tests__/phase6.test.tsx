import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import { resetRouterMock, routerMock as router } from '../../testing/routerMock';
import type { UtcIso } from '../../shared/time';
import BrokerCheckScreen from '../(tabs)/more/broker-check';
import ChecklistScreen from '../(tabs)/more/checklist';
import MoreScreen from '../(tabs)/more/index';
import EditPlanScreen from '../(tabs)/more/plan/edit';
import TradingPlanScreen from '../(tabs)/more/plan/index';
import ProgressReviewScreen from '../(tabs)/more/progress-review';
import SessionsScreen from '../(tabs)/more/sessions';
import SettingsScreen from '../(tabs)/more/settings';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

async function fillPlan() {
  await fireEvent.changeText(await screen.findByTestId('plan-field-instruments'), 'eurusd, gbpusd');
  await fireEvent.press(within(screen.getByLabelText('Sessions I trade')).getByRole('checkbox', { name: 'London' }));
  await fireEvent.press(within(screen.getByLabelText('Timeframes')).getByRole('checkbox', { name: 'H1' }));
  await fireEvent.changeText(screen.getByTestId('plan-field-entryRules'), 'Retest of a broken level');
  await fireEvent.changeText(screen.getByTestId('plan-field-exitRules'), 'Target or stop');
  await fireEvent.changeText(screen.getByTestId('plan-field-stopRules'), 'Beyond the last swing');
  await fireEvent.changeText(screen.getByTestId('plan-field-stopTradingWhen'), 'After 2 losses in a day');
}

describe('More → Tools', () => {
  it('lists the Phase 6 tools', async () => {
    await renderWith(<MoreScreen />);
    for (const id of ['progressReview', 'tradingPlan', 'checklist', 'sessions', 'brokerCheck']) expect(await screen.findByTestId(`more-${id}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('more-tradingPlan'));
    expect(router.push).toHaveBeenCalledWith('/more/plan');
  });
});

describe('Trading plan', () => {
  it('starts empty, shows what is missing, saves versions, and lists what changed', async () => {
    await renderWith(<TradingPlanScreen />);
    await press('Write my plan');
    expect(router.push).toHaveBeenCalledWith('/more/plan/edit');
    await screen.unmount();

    await renderWith(<EditPlanScreen />);
    await press('Save as a new version');
    expect(screen.getByTestId('plan-issues')).toHaveTextContent(/7 things need fixing/);
    expect(screen.getByText('Add at least one instrument you will trade')).toBeTruthy();
    await fillPlan();
    await press('Save as a new version');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    await screen.unmount();

    await renderWith(<EditPlanScreen />);
    expect(await screen.findByDisplayValue('EURUSD, GBPUSD')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('plan-field-maxTradesPerDay'), '2');
    await press('Save as a new version');
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(2));
    await screen.unmount();

    await renderWith(<TradingPlanScreen />);
    expect(await screen.findByTestId('plan-instruments')).toHaveTextContent(/EURUSD, GBPUSD/);
    expect(screen.getByTestId('plan-sessions')).toHaveTextContent(/London/);
    expect(screen.getByTestId('plan-version-2')).toHaveTextContent(/changed: Most trades per day/);
    expect(screen.getByTestId('plan-version-1')).toHaveTextContent(/first version/);
  });

  it('copies the plan’s limits into the risk rules, keeping the others', async () => {
    await renderWith(<EditPlanScreen />);
    await fillPlan();
    await fireEvent.changeText(screen.getByTestId('plan-field-riskPerTradePercent'), '0,5');
    await fireEvent.changeText(screen.getByTestId('plan-field-dailyLossPercent'), '2');
    await press('Save as a new version');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    await screen.unmount();

    await renderWith(<TradingPlanScreen />);
    await press('Use these limits in my risk rules');
    expect(await screen.findByTestId('plan-message')).toHaveTextContent(/now use the plan/);
    const s = await harness.container.settings.get();
    expect(s.ok && s.value.riskRules).toMatchObject({ maxRiskPerTradePercent: 0.5, maxDailyLossPercent: 2, maxOpenPositions: 3, requireStop: true });
  });
});

describe('Pre-trade checklist', () => {
  it('asks every question, lists cautions, then opens MetaTrader or offers the store', async () => {
    await renderWith(<ChecklistScreen />);
    const answer = (id: string, name: string) => fireEvent.press(within(screen.getByTestId(`checklist-${id}`)).getByRole('radio', { name }));
    expect(screen.getByRole('button', { name: 'Open MetaTrader' })).toBeDisabled();
    await answer('in_plan', 'Yes');
    await answer('stop_set', 'Yes');
    await answer('risk_within', 'Not sure');
    await answer('news_soon', 'Yes');
    expect(screen.getByTestId('checklist-unanswered')).toHaveTextContent(/1 question left to answer\./);
    await answer('calm', 'Yes');
    expect(screen.getByText(/The risk is over your limit, or you have not worked it out/)).toBeTruthy();
    expect(screen.getByText(/News may be due/)).toBeTruthy();

    await press('Open MetaTrader');
    await waitFor(() => expect(harness.apps.launched).toEqual(['mt5']));
    await fireEvent.press(screen.getByRole('radio', { name: 'MetaTrader 4' }));
    await press('Open MetaTrader');
    expect(await screen.findByTestId('checklist-open-outcome')).toHaveTextContent(/MetaTrader is not installed on this phone\./);
    await press('Get MetaTrader from the store');
    await waitFor(() => expect(harness.apps.opened).toEqual(['mt4']));
    await press('Start again');
    expect(screen.getByRole('button', { name: 'Open MetaTrader' })).toBeDisabled();
  });

  it('can be turned off for paper orders in Settings', async () => {
    await renderWith(<SettingsScreen />);
    await fireEvent.press(within(await screen.findByLabelText('Ask the pre-trade checklist before each paper order')).getByRole('radio', { name: 'Off' }));
    await waitFor(async () => {
      const s = await harness.container.settings.get();
      expect(s.ok && s.value.preTradeChecklist).toBe(false);
    });
  });
});

describe('Market sessions', () => {
  it('shows open sessions and the overlap in the learner’s time zone', async () => {
    // Thursday 10:00 UTC, the week London is already on winter time but New York is not (Lagos is UTC+1).
    await renderWith(<SessionsScreen />);
    expect(await screen.findByTestId('sessions-now')).toHaveTextContent(/Now: Thu 11:00/);
    expect(screen.getByTestId('session-london')).toHaveTextContent(/Open until Thu 18:00/);
    expect(screen.getByTestId('session-new_york')).toHaveTextContent(/Opens Thu 13:00/);
    expect(screen.getByTestId('overlap-london-new_york')).toHaveTextContent(/London and New York: Thu 13:00 to Thu 18:00/);
    expect(screen.queryByText(/Weekend/)).toBeNull();
  });
});

describe('Broker check', () => {
  it('counts the steps not done and links to the lesson', async () => {
    await renderWith(<BrokerCheckScreen />);
    expect(screen.getByTestId('broker-check-status')).toHaveTextContent(/7 steps not done/);
    await fireEvent.press(screen.getByRole('checkbox', { name: /exact name is on the regulator/ }));
    expect(screen.getByTestId('broker-check-status')).toHaveTextContent(/6 steps not done/);
    await press('Read the lesson on checking a broker');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/lesson/[id]', params: { id: 'fx-broker-check' } });
  });
});

describe('Practice Progress Review', () => {
  it('reports objectives, calculations, conditions and gaps without profit, and ends with the reminder', async () => {
    const c = harness.container;
    await c.learning.recordReviewSession(
      { kind: 'checkpoint', refId: 'forex-basics-checkpoint', answers: { 'fxb-cp-1': ['a'], 'fxb-cp-2': ['a'], 'fxb-cp-3': ['a'], 'fxb-cp-4': ['b'], 'fxb-cp-5': ['a', 'b'] }, score: 1, passed: true },
      [],
      NOW,
    );
    await c.learning.recordReviewSession(
      { kind: 'checkpoint', refId: 'forex-risk-checkpoint', answers: { 'forex-risk-checkpoint-q1': ['b'], 'forex-risk-checkpoint-q2': ['a'] }, score: 0.5, passed: false },
      [],
      NOW,
    );
    await c.learning.recordReviewSession(
      { kind: 'lesson_check', refId: 'fx-position-sizing', answers: { 'fx-position-sizing-q1': ['b'], 'fx-position-sizing-q2': ['b'] }, score: 0.5, passed: false },
      [],
      NOW,
    );
    await c.practice.recordDrill({ kind: 'size_it', seed: 1, optionId: 'a', correct: true }, NOW);

    await renderWith(<ProgressReviewScreen />);
    expect(await screen.findByTestId('review-objective-forex-basics')).toHaveTextContent(/checkpoint passed \(best 100%\)/);
    expect(screen.getByTestId('review-objective-forex-risk')).toHaveTextContent(/checkpoint not passed yet \(best 50%\)/);
    expect(screen.getByTestId('review-calc-risk_sizing')).toHaveTextContent(/1 of 2 correct \(50%\)/);
    expect(screen.getByTestId('review-calc-size_it_drill')).toHaveTextContent(/1 of 1 correct \(100%\)/);
    expect(screen.getByTestId('review-condition-news')).toHaveTextContent(/not yet/);
    expect(screen.getByText(/Checkpoint not passed yet: Risk/)).toBeTruthy();
    expect(screen.getByText(/Completing practice does not show that you are ready to trade real money/)).toBeTruthy();
    // "ready" appears only in the reminder that practice does not show readiness.
    expect(screen.queryByText(/profit(?! and loss are not part)|\bready\b(?! to trade real money)/i)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the module’s lessons again' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/lesson/[id]', params: { id: 'fx-risk-per-trade' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Revisit the lesson you missed' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/lesson/[id]', params: { id: 'fx-position-sizing' } });
  });
});
