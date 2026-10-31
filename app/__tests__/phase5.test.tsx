import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { SYNTHETIC_MT4_STATEMENT } from '../../testing/statementFixture';
import type { HostNode } from '../../testing/a11y';
import { expectSimulatedFiguresBadged } from '../../testing/simulatedFigures';
import JournalEntryRoute from '../(tabs)/journal/entry/[id]';
import ImportStatementScreen from '../(tabs)/journal/import';
import JournalScreen from '../(tabs)/journal/index';
import NewDemoTradeScreen from '../(tabs)/journal/new';
import PsychologyLabScreen from '../(tabs)/journal/psychology';
import JournalStatsScreen from '../(tabs)/journal/stats';
import MoreScreen from '../(tabs)/more/index';
import RiskRulesScreen from '../(tabs)/more/risk-rules';
import PaperAccountScreen from '../(tabs)/practice/paper/[id]';
import PaperAccountsScreen from '../(tabs)/practice/paper/index';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

describe('Risk rules', () => {
  it('is listed under More, rejects out-of-range limits, and saves valid ones', async () => {
    await renderWith(<MoreScreen />);
    await fireEvent.press(await screen.findByTestId('more-riskRules'));
    expect(router.push).toHaveBeenCalledWith('/more/risk-rules');
    await screen.unmount();

    await renderWith(<RiskRulesScreen />);
    await fireEvent.changeText(await screen.findByTestId('rule-maxRiskPerTradePercent'), '50');
    await press('Save my rules');
    expect(screen.getByTestId('risk-rules-message')).toHaveTextContent(/must be between 0.1 and 10/);
    await fireEvent.changeText(screen.getByTestId('rule-maxRiskPerTradePercent'), '0,5');
    await press('Save my rules');
    await waitFor(() => expect(screen.getByTestId('risk-rules-message')).toHaveTextContent(/Rules saved/));
    const saved = await harness.container.settings.get();
    expect(saved.ok && saved.value.riskRules.maxRiskPerTradePercent).toBe(0.5);
  });
});

describe('Paper trading', () => {
  it('starts an account and opens it', async () => {
    await renderWith(<PaperAccountsScreen />);
    expect(await screen.findByText('No accounts yet. Start one below.')).toBeTruthy();
    await fireEvent.press(within(screen.getByLabelText('Market')).getByRole('radio', { name: /Futures/ }));
    await press('Start paper trading');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/practice/paper/[id]', params: { id: expect.any(String) } }));
    const list = await harness.container.paper.list();
    expect(list.ok && list.value[0]!.instrumentId).toBe('sim-index-future');
  });

  it('checks an order against the rules, places it anyway, fills it, and closes it into the journal', async () => {
    const created = await harness.container.paper.list();
    expect(created.ok).toBe(true);
    await renderWith(<PaperAccountsScreen />);
    await press('Start paper trading');
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    const id = (router.push.mock.calls[0]![0] as { params: { id: string } }).params.id;
    await screen.unmount();

    searchParams.current = { id };
    await renderWith(<PaperAccountScreen />);
    expect(await screen.findByText('Paper trading — simulated')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('paper-size'), '0.1');
    await press('Check against my risk rules');
    expect(await screen.findByText(/Breaks a rule: Every trade has a stop loss/)).toBeTruthy();
    // Changing the side after a check throws the check away, so the old order cannot be placed under a new label.
    await fireEvent.press(within(screen.getByLabelText('Side')).getByRole('radio', { name: 'Sell' }));
    expect(screen.queryByTestId('paper-check')).toBeNull();
    await fireEvent.press(within(screen.getByLabelText('Side')).getByRole('radio', { name: 'Buy' }));
    await press('Check against my risk rules');
    // The pre-trade checklist (on by default) takes the stop and risk answers from the order and gates Place.
    const answerOf = (id: string, name: string) => within(screen.getByTestId(`checklist-${id}`)).getByRole('radio', { name });
    expect(answerOf('stop_set', 'No')).toBeSelected();
    expect(answerOf('stop_set', 'Yes')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Place anyway (recorded as a rule break)' })).toBeDisabled();
    await fireEvent.press(answerOf('in_plan', 'Yes'));
    await fireEvent.press(answerOf('news_soon', 'No'));
    await fireEvent.press(answerOf('calm', 'Yes'));
    expect(screen.getByText(/There is no stop, so the possible loss is not defined/)).toBeTruthy();
    await press('Place anyway (recorded as a rule break)');
    await waitFor(() => expect(screen.getByTestId('paper-order')).toBeTruthy());
    await press('Next candle');
    await waitFor(() => expect(screen.getByTestId('paper-position')).toBeTruthy());
    await press(/^Close position/);
    await waitFor(() => expect(screen.getByTestId('paper-history-item')).toHaveTextContent(/rule broken/));
    const journal = await harness.container.journal.list({ source: 'paper' });
    expect(journal.ok && journal.value.map((e) => e.ruleViolations)).toEqual([['no_stop']]);
  });
});

describe('Journal', () => {
  it('lists entries with their source, filters, and opens one', async () => {
    harness.journalFiles.nextStatement = { name: 'demo.htm', text: SYNTHETIC_MT4_STATEMENT };
    await renderWith(<ImportStatementScreen />);
    await press('Choose a statement file');
    expect(await screen.findAllByTestId('import-row')).toHaveLength(2);
    // Each previewed demo result is badged (brief §1).
    expectSimulatedFiguresBadged(screen.container as unknown as HostNode, { atLeast: 2 });
    await press('Import 2 trades');
    expect(await screen.findByTestId('import-done')).toHaveTextContent('Imported 2 trades');
    await screen.unmount();

    await renderWith(<JournalScreen />);
    const rows = await screen.findAllByTestId('journal-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Imported from MT statement/);
    expectSimulatedFiguresBadged(screen.container as unknown as HostNode, { atLeast: 2 });
    await fireEvent.press(within(screen.getByLabelText('Show')).getByRole('radio', { name: 'Paper trading (simulated)' }));
    expect(await screen.findByText(/No trades yet/)).toBeTruthy();
    await fireEvent.press(within(screen.getByLabelText('Show')).getByRole('radio', { name: 'All' }));
    await fireEvent.press((await screen.findAllByTestId('journal-row'))[0]!);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/journal/entry/[id]', params: { id: expect.any(String) } });
  });

  it('adds a demo trade by hand and validates it', async () => {
    await renderWith(<NewDemoTradeScreen />);
    await press('Save to journal');
    expect(await screen.findByTestId('manual-error')).toHaveTextContent('Instrument is required');
    await fireEvent.changeText(screen.getByTestId('manual-instrument'), 'EURUSD');
    await fireEvent.changeText(screen.getByTestId('manual-size'), '0.1');
    await fireEvent.changeText(screen.getByTestId('manual-entry'), '1.1');
    await fireEvent.changeText(screen.getByTestId('manual-result'), '-20');
    await press('Save to journal');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/journal/entry/[id]', params: { id: expect.any(String) } }));
  });

  it('keeps a draft screenshot while editing and removes it if the trade is never saved', async () => {
    harness.journalFiles.nextScreenshot = 'file:///docs/journal-shots/draft.jpg';
    await renderWith(<NewDemoTradeScreen />);
    await press('Attach a chart screenshot');
    expect(await screen.findByRole('button', { name: 'Replace screenshot' })).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('manual-instrument'), 'EURUSD');
    expect(harness.journalFiles.deleted).toEqual([]);
    await screen.unmount();
    expect(harness.journalFiles.deleted).toEqual(['file:///docs/journal-shots/draft.jpg']);
  });

  it('reviews an entry: the process score changes, the result does not', async () => {
    const parsed = await harness.container.journal.add(
      {
        source: 'manual', sourceRef: null, externalId: null, market: 'forex', instrument: 'EURUSD', direction: 'buy', strategy: null, entry: '1.1', stop: '1.09', target: null,
        size: '0.1', sizeUnit: 'lots', exit: '1.09', pnlMoney: '-100', pnlPips: null, pnlR: '-1', plannedRisk: '100', costs: null, equityAtEntry: '10000', openedAt: null, closedAt: null,
        conditions: null, entryRationale: 'Retest', exitRationale: null, emotion: null, ruleViolations: [], noteBefore: null, noteAfter: null, screenshotUri: null, processScore: 0.8,
      },
      '2026-10-29T10:00:00.000Z' as never,
    );
    if (!parsed.ok) throw new Error(parsed.error.message);
    searchParams.current = { id: parsed.value.id };
    await renderWith(<JournalEntryRoute />);
    expect(await screen.findByTestId('journal-process')).toHaveTextContent('Process score: 80%');
    await press('Save review');
    expect(await screen.findByText('Say whether you followed your rules')).toBeTruthy();
    await fireEvent.press(within(screen.getByLabelText('3. Did you follow your rules?')).getByRole('radio', { name: 'Yes' }));
    await fireEvent.changeText(screen.getByTestId('review-lesson'), 'The stop did its job');
    await press('Save review');
    await waitFor(() => expect(screen.getByTestId('journal-process')).toHaveTextContent('Process score: 100%'));
    // The result is unchanged by the review: still a loss of 100.00 (shown with sign, arrow and R, beside its Demo badge).
    expect(screen.getByTestId('journal-result')).toHaveProp('accessibilityLabel', 'Result, loss of 100.00, 1.0 R');
    expectSimulatedFiguresBadged(screen.container as unknown as HostNode, { atLeast: 1 });
  });

  it('shows weekly summaries with results per source', async () => {
    harness.journalFiles.nextStatement = { name: 'demo.htm', text: SYNTHETIC_MT4_STATEMENT };
    await renderWith(<ImportStatementScreen />);
    await press('Choose a statement file');
    await press('Import 2 trades');
    await screen.findByTestId('import-done');
    await screen.unmount();
    await renderWith(<JournalStatsScreen />);
    expect(await screen.findByText(/Imported from MT statement: 2 trades/)).toBeTruthy();
    expect(screen.getByLabelText('Imported from MT statement net result, loss of 2.22')).toBeTruthy();
    expectSimulatedFiguresBadged(screen.container as unknown as HostNode, { atLeast: 1 });
    expect(screen.getByTestId('summary-period')).toHaveTextContent('Week of 2026-01-05');
  });

  it('runs a Psychology Lab scenario and shows every explanation after answering', async () => {
    await renderWith(<PsychologyLabScreen />);
    expect(await screen.findByText(/not a mental-health assessment/)).toBeTruthy();
    const rows = await screen.findAllByTestId('psych-row');
    expect(rows).toHaveLength(14);
    await fireEvent.press(rows[0]!);
    const choices = await screen.findAllByRole('button');
    await act(async () => fireEvent.press(choices[0]!));
    expect(await screen.findByText('Takeaway')).toBeTruthy();
    expect(screen.getAllByTestId(/psych-quality-/).length).toBeGreaterThanOrEqual(3);
    const attempts = await harness.container.journal.psychAttempts();
    expect(attempts.ok && attempts.value).toHaveLength(1);
  });
});
