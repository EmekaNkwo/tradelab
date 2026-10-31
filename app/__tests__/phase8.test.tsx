import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import type { Container } from '../../features/app';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { contentCitingUnreviewed, contentWithWithheldModule, fixtureContent } from '../../testing/strategyFixtures';
import { err } from '../../shared/result';
import { fromUnknown } from '../../shared/errors';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import MoreScreen from '../(tabs)/more/index';
import ReplayScreen from '../(tabs)/practice/replay';
import StrategiesScreen from '../(tabs)/strategies/index';
import ResearchScreen from '../research/index';
import StrategyScreen from '../strategy/[id]';
import TraderScreen from '../trader/[id]';
import TradersScreen from '../traders';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => {
  harness.db.close();
  jest.restoreAllMocks();
});

const renderWith = (ui: ReactElement, container: Container = harness.container) => render(<TestProviders container={container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));
const withFixtures = (): Container => ({ ...harness.container, content: fixtureContent() });
const plain = (t: string) => t.replace(/\[\[[^|\]]+\|([^\]]+)\]\]|\[\[([^\]]+)\]\]/g, '$1$2');

describe('Strategy Library', () => {
  it('lists the generic pages by category, searches, and filters', async () => {
    await renderWith(<StrategiesScreen />);
    expect(await screen.findByTestId('strategy-group-trading')).toBeTruthy();
    expect(within(screen.getByTestId('strategy-group-investing')).getByTestId('strategy-dividend-index-investing')).toBeTruthy();
    expect(within(screen.getByTestId('strategy-group-risk_principle')).getByTestId('strategy-diversification-position-sizing')).toBeTruthy();
    // Nothing about named traders appears until a person has reviewed it.
    expect(screen.queryByTestId('strategies-traders')).toBeNull();
    expect(screen.queryByTestId('strategies-great-traders')).toBeNull();

    fireEvent.changeText(screen.getByTestId('strategy-search'), 'carry');
    await waitFor(() => expect(screen.queryByTestId('strategy-trend-following-moving-averages')).toBeNull());
    expect(screen.getByTestId('strategy-carry-concept')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('strategy-search'), 'no such strategy here');
    expect(await screen.findByText('No strategies match')).toBeTruthy();
    await press('Clear search and filters');

    await press('Filters');
    await fireEvent.press(within(screen.getByLabelText('Category')).getByRole('checkbox', { name: 'Investing approaches' }));
    await waitFor(() => expect(screen.queryByTestId('strategy-group-trading')).toBeNull());
    await fireEvent.press(within(screen.getByLabelText('Rules-based or discretionary')).getByRole('checkbox', { name: 'Rules-based' }));
    await waitFor(() => expect(screen.queryByTestId('strategy-value-investing-concept')).toBeNull());
    expect(screen.getByTestId('strategy-dividend-index-investing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide filters' })).toBeTruthy();
    await press('Clear filters');
    expect(await screen.findByTestId('strategy-group-trading')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('strategy-range-trading'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/strategy/[id]', params: { id: 'range-trading' } });
  });

  it('shows bookmarks and an ordered study list', async () => {
    const repo = harness.container.strategies;
    const now = '2026-10-29T10:00:00.000Z' as never;
    await repo.add('range-trading', 'study', now);
    await repo.add('carry-concept', 'study', now);
    await repo.add('seasonality', 'bookmark', now);
    await renderWith(<StrategiesScreen />);
    const study = await screen.findByTestId('study-list');
    expect(within(study).getByTestId('study-range-trading')).toHaveTextContent(/1\. Range trading/);
    expect(within(screen.getByTestId('bookmarks')).getByTestId('bookmark-seasonality')).toBeTruthy();
    await press('Move Carry (concept) up');
    await waitFor(() => expect(screen.getByTestId('study-carry-concept')).toHaveTextContent(/1\. Carry/));
  });

  it('a study list item hidden from the content does not block moving, and a failed move says so', async () => {
    const repo = harness.container.strategies;
    const now = '2026-10-29T10:00:00.000Z' as never;
    await repo.add('range-trading', 'study', now);
    await repo.add('page-no-longer-shipped', 'study', now);
    await repo.add('carry-concept', 'study', now);
    await renderWith(<StrategiesScreen />);
    expect(await screen.findByTestId('study-carry-concept')).toHaveTextContent(/2\. Carry/);
    await press('Move Carry (concept) up');
    await waitFor(() => expect(screen.getByTestId('study-carry-concept')).toHaveTextContent(/1\. Carry/));

    jest.spyOn(harness.container.strategies, 'move').mockResolvedValue(err(fromUnknown('StorageError', 'locked', new Error('locked'))));
    await press('Move Range trading up');
    expect(await screen.findByText('Your study list could not be reordered. Try again.')).toBeTruthy();
  });
});

describe('Strategy page', () => {
  it('links only lessons that exist after the gate', async () => {
    searchParams.current = { id: 'mean-reversion-rsi-bands' };
    await renderWith(<StrategyScreen />, { ...harness.container, content: contentWithWithheldModule('forex-indicators') });
    expect(await screen.findByTestId('strategy-lesson-ta-market-regimes')).toBeTruthy();
    expect(screen.queryByTestId('strategy-lesson-fx-rsi')).toBeNull();
    expect(screen.queryByText('fx-rsi')).toBeNull();
  });

  it('says when the knowledge-check result could not be saved, and does not count it', async () => {
    jest.spyOn(harness.container.labs, 'record').mockResolvedValue(err(fromUnknown('StorageError', 'disk full', new Error('disk full'))));
    const strategy = harness.container.content.strategy('carry-concept')!;
    searchParams.current = { id: strategy.id };
    await renderWith(<StrategyScreen />);
    for (const [i, q] of strategy.knowledgeCheck.entries()) {
      const correct = q.options.find((o) => q.correctOptionIds.includes(o.id))!;
      await fireEvent.press(within(await screen.findByLabelText(q.prompt)).getByRole('radio', { name: plain(correct.text) }));
      await press('Check answer');
      await press(i === strategy.knowledgeCheck.length - 1 ? 'Finish' : 'Next question');
    }
    expect(await screen.findByText('Knowledge check passed')).toBeTruthy();
    expect(await screen.findByText('Not saved')).toBeTruthy();
    expect(screen.getByTestId('section-completion')).toHaveTextContent(/Not completed yet/);
  });

  it('shows the template sections and opens Chart Lab and Replay with the suggested setup', async () => {
    searchParams.current = { id: 'trend-following-moving-averages' };
    await renderWith(<StrategyScreen />);
    for (const id of ['overview', 'evidence', 'simple', 'reasoning', 'rules', 'demo', 'replay', 'exercise', 'failure', 'limitations', 'check']) {
      expect(screen.getByTestId(`section-${id}`)).toBeTruthy();
    }
    expect(screen.getByText("A simplified educational version, not any trader's system")).toBeTruthy();
    expect(within(screen.getByTestId('section-evidence')).getByText(/No trader is named here/)).toBeTruthy();
    expect(screen.getByText(/not evidence that it works/)).toBeTruthy();
    await press('Explain in more depth');
    expect(screen.getByText(/enters late and exits late/, { exact: false })).toBeTruthy();

    await press('Open in Chart Lab');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/practice/chart-lab', params: expect.objectContaining({ scenario: 'strong_uptrend' }) });
    await press('Open Replay');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/practice/replay', params: { scenario: 'strong_uptrend' } });
  });

  it('a concept page shows only the sections it has', async () => {
    searchParams.current = { id: 'carry-concept' };
    await renderWith(<StrategyScreen />);
    expect(await screen.findByTestId('section-overview')).toBeTruthy();
    for (const id of ['rules', 'demo', 'replay']) expect(screen.queryByTestId(`section-${id}`)).toBeNull();
    expect(screen.getByTestId('section-exercise')).toBeTruthy();
  });

  it('bookmarks and adds to the study list', async () => {
    searchParams.current = { id: 'range-trading' };
    await renderWith(<StrategyScreen />);
    await press('Bookmark');
    await press('Add to study list');
    expect(await screen.findByRole('button', { name: 'Remove bookmark' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Remove from study list' })).toBeTruthy();
    const saved = await harness.container.strategies.saved();
    expect(saved.ok && saved.value.map((s) => s.list).sort()).toEqual(['bookmark', 'study']);
    await press('Remove bookmark');
    expect(await screen.findByRole('button', { name: 'Bookmark' })).toBeTruthy();
  });

  it('records the guided exercise and the knowledge check, and tracks completion from them', async () => {
    const strategy = harness.container.content.strategy('range-trading')!;
    searchParams.current = { id: strategy.id };
    await renderWith(<StrategyScreen />);
    expect(await screen.findByTestId('section-completion')).toHaveTextContent(/Not completed yet/);

    const exercise = strategy.exercise!;
    const group = screen.getByLabelText(exercise.prompt);
    for (const o of exercise.options.filter((x) => x.correct)) await fireEvent.press(within(group).getByRole('checkbox', { name: plain(o.text) }));
    await press('Check my answer');
    expect(await screen.findByTestId('pick-result')).toHaveTextContent(new RegExp(`^${exercise.options.length} of ${exercise.options.length} judged correctly`));

    for (const [i, q] of strategy.knowledgeCheck.entries()) {
      const correct = q.options.find((o) => q.correctOptionIds.includes(o.id))!;
      await fireEvent.press(within(screen.getByLabelText(q.prompt)).getByRole('radio', { name: plain(correct.text) }));
      await press('Check answer');
      await press(i === strategy.knowledgeCheck.length - 1 ? 'Finish' : 'Next question');
    }
    expect(await screen.findByText('Knowledge check passed')).toBeTruthy();
    expect(screen.getByText('You scored 100%. You need 80% to pass.')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('section-completion')).toHaveTextContent(/Completed/));
    expect(screen.getByTestId('section-completion')).not.toHaveTextContent(/Not completed yet/);

    const attempts = await harness.container.labs.attempts();
    expect(attempts.ok && attempts.value.map((a) => `${a.kind}:${a.refId}:${a.score}`).sort()).toEqual(['strategy_check:range-trading:1', 'strategy_exercise:range-trading:1']);
    await press('Take the check again');
    expect(screen.getByLabelText(strategy.knowledgeCheck[0]!.prompt)).toBeTruthy();
  });

  it('a failed knowledge check says so and does not count as complete', async () => {
    const strategy = harness.container.content.strategy('carry-concept')!;
    searchParams.current = { id: strategy.id };
    await renderWith(<StrategyScreen />);
    for (const [i, q] of strategy.knowledgeCheck.entries()) {
      const wrong = q.options.find((o) => !q.correctOptionIds.includes(o.id))!;
      await fireEvent.press(within(await screen.findByLabelText(q.prompt)).getByRole('radio', { name: plain(wrong.text) }));
      await press('Check answer');
      await press(i === strategy.knowledgeCheck.length - 1 ? 'Finish' : 'Next question');
    }
    expect(await screen.findByText('Not passed yet')).toBeTruthy();
    expect(screen.getByText('You scored 0%. You need 80% to pass.')).toBeTruthy();
    expect(screen.getByTestId('section-completion')).toHaveTextContent(/Not completed yet/);
  });

  it('says when a strategy does not exist, and hides reviewed-only strategies', async () => {
    searchParams.current = { id: 'fixture-held' };
    await renderWith(<StrategyScreen />, withFixtures());
    expect(await screen.findByText('Strategy not found')).toBeTruthy();
  });

  it('a reviewed documented strategy names its trader and cites its sources', async () => {
    searchParams.current = { id: 'fixture-documented' };
    await renderWith(<StrategyScreen />, withFixtures());
    const evidence = await screen.findByTestId('section-evidence');
    expect(within(evidence).getByTestId('strategy-trader-fixture-trader')).toBeTruthy();
    expect(within(evidence).getByText(/Fixture Primary Book/)).toBeTruthy();
    expect(screen.getByText('Fixture documented rules')).toBeTruthy();
  });
});

describe('Famous traders and the Research Library', () => {
  it('stay hidden while nothing has been reviewed', async () => {
    await renderWith(<MoreScreen />);
    expect(screen.queryByText('Research Library')).toBeNull();
    await screen.unmount();
    await renderWith(<TradersScreen />);
    expect(screen.getByText('No trader pages yet')).toBeTruthy();
    await screen.unmount();
    await renderWith(<ResearchScreen />);
    expect(screen.getByText('No reviewed sources yet')).toBeTruthy();
  });

  it('show reviewed traders, their documented and unverified statements, and reviewed sources', async () => {
    const container = withFixtures();
    await renderWith(<StrategiesScreen />, container);
    await fireEvent.press(await screen.findByTestId('strategies-traders'));
    expect(router.push).toHaveBeenCalledWith('/traders');
    await screen.unmount();

    await renderWith(<TradersScreen />, container);
    expect(screen.getByTestId('trader-fixture-trader')).toBeTruthy();
    expect(screen.queryByTestId('trader-fixture-unreviewed-trader')).toBeNull();
    await screen.unmount();

    searchParams.current = { id: 'fixture-trader' };
    await renderWith(<TraderScreen />, container);
    expect(screen.getByTestId('trader-documented')).toHaveTextContent(/Fixture documented statement\. \(Sources: Fixture Primary Book\)/);
    expect(screen.getByTestId('trader-interpretations')).toHaveTextContent(/Fixture interpretation/);
    expect(screen.getByTestId('trader-unverified')).toHaveTextContent(/Fixture unverified claim/);
    expect(screen.getByTestId('trader-strategy-fixture-documented')).toBeTruthy();
    expect(screen.queryByTestId('trader-strategy-fixture-held')).toBeNull();
    await fireEvent.press(screen.getByTestId('trader-source-fixture-primary'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/research', params: { source: 'fixture-primary' } });
    await screen.unmount();

    searchParams.current = { id: 'fixture-unreviewed-trader' };
    await renderWith(<TraderScreen />, container);
    expect(screen.getByText('Trader page not found')).toBeTruthy();
    await screen.unmount();

    await renderWith(<MoreScreen />, container);
    expect(screen.getByText('Research Library')).toBeTruthy();
    await screen.unmount();

    searchParams.current = {};
    await renderWith(<ResearchScreen />, container);
    expect(screen.getByTestId('source-fixture-primary')).toBeTruthy();
    expect(screen.queryByTestId('source-fixture-unreviewed')).toBeNull();
    expect(screen.getByTestId('disagreements-fixture-primary')).toHaveTextContent(/Fixture Secondary Article.*different exit rules/);
    await fireEvent.press(within(screen.getByLabelText('Source quality')).getByRole('checkbox', { name: 'Strong secondary source' }));
    await waitFor(() => expect(screen.queryByTestId('source-fixture-primary')).toBeNull());
    expect(screen.getByTestId('source-fixture-secondary')).toBeTruthy();
  });
});

describe('Unreviewed sources are never cited', () => {
  it('trader pages and the Research Library show only reviewed sources', async () => {
    const container = { ...harness.container, content: contentCitingUnreviewed() };
    searchParams.current = { id: 'fixture-trader' };
    await renderWith(<TraderScreen />, container);
    expect(screen.getByTestId('trader-documented')).toHaveTextContent(/\(Sources: Fixture Primary Book\)/);
    expect(screen.queryByText(/Fixture Unreviewed Source/)).toBeNull();
    expect(screen.queryByTestId('trader-source-fixture-unreviewed')).toBeNull();
    await screen.unmount();

    searchParams.current = {};
    await renderWith(<ResearchScreen />, container);
    expect(screen.getByTestId('disagreements-fixture-primary')).not.toHaveTextContent(/Unreviewed disagreement/);
    expect(screen.queryByText(/Fixture Unreviewed Source/)).toBeNull();
  });
});

describe('Replay from a strategy page', () => {
  it('starts with the suggested scenario, and ignores an unknown one', async () => {
    searchParams.current = { scenario: 'range' };
    await renderWith(<ReplayScreen />);
    expect(within(screen.getByLabelText('Scenario')).getByRole('radio', { name: 'Range' })).toBeSelected();
    await screen.unmount();
    searchParams.current = { scenario: 'not-a-scenario' };
    await renderWith(<ReplayScreen />);
    expect(within(screen.getByLabelText('Scenario')).getByRole('radio', { name: 'Breakout' })).toBeSelected();
  });
});
