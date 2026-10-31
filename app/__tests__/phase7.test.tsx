import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { completeOnboarding, type OnboardingInput } from '../../features/learning/useCases';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import CalculatorsScreen from '../(tabs)/learn/calculators';
import LearnScreen from '../(tabs)/learn/index';
import ProgramsScreen from '../(tabs)/learn/programs';
import ChartLabScreen from '../(tabs)/practice/chart-lab';
import CompaniesScreen from '../labs/companies';
import CompanyScreen from '../labs/company/[id]';
import LabConceptScreen from '../labs/concept/[id]';
import LabConceptsScreen from '../labs/concepts/[lab]';
import LabsScreen from '../labs/index';
import MarketsScreen from '../labs/markets';
import RedFlagCaseScreen from '../labs/red-flag/[id]';
import RedFlagsScreen from '../labs/red-flags';
import ScenarioScreen from '../labs/scenario/[id]';
import ScenariosScreen from '../labs/scenarios';
import LessonScreen from '../lesson/[id]';

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

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

const ONBOARDING: OnboardingInput = {
  riskAcknowledged: true,
  experience: 'complete_beginner',
  markets: ['forex'],
  goals: ['understand_markets'],
  explanationLevel: 'simple',
  metaTrader: { version: 'mt5', installed: false },
  timeZone: 'Africa/Lagos',
  programId: 'practical-forex-trader',
  settings: { startDate: '2026-10-29' as never, timeline: { kind: 'weeks', weeks: 12 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
  classTime: '19:30',
  remindersEnabled: true,
  placementPassedModuleIds: [],
};

describe('Programs', () => {
  it('adds a program to the queue and starts it after confirming', async () => {
    const enrolled = await completeOnboarding(harness.container, ONBOARDING);
    if (!enrolled.ok) throw new Error(enrolled.error.message);
    await renderWith(<ProgramsScreen />);
    expect(await screen.findByTestId('program-state-practical-forex-trader')).toHaveTextContent('Under way');
    expect(screen.getByTestId('program-state-trader-development')).toHaveTextContent('Not added');
    await press('Add this program');
    expect(await screen.findByText(/It waits in your queue until you start it/)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('program-state-trader-development')).toHaveTextContent('In your queue (number 1)'));

    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    await press('Start it now');
    expect(alert).toHaveBeenCalledWith('Start Trader Development now?', expect.stringMatching(/goes back to your queue/), expect.any(Array));
    expect(await screen.findByText(/Trader Development is now under way/)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('program-state-trader-development')).toHaveTextContent('Under way'));
    expect(screen.getByTestId('program-state-practical-forex-trader')).toHaveTextContent('In your queue (number 1)');
  });

  it('cancelling the confirmation leaves the queue as it was', async () => {
    await completeOnboarding(harness.container, ONBOARDING);
    await renderWith(<ProgramsScreen />);
    await press('Add this program');
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await press('Start it now');
    expect(screen.getByTestId('program-state-trader-development')).toHaveTextContent(/In your queue/);
  });

  it('the Learn tab browses any program and links to programs and labs', async () => {
    await renderWith(<LearnScreen />);
    expect(await screen.findByRole('header', { name: 'Practical Forex Trader' })).toBeTruthy();
    expect(within(screen.getByLabelText('Browse a program')).getByRole('radio', { name: 'Practical Forex Trader' })).toBeSelected();
    await fireEvent.press(within(screen.getByLabelText('Browse a program')).getByRole('radio', { name: 'Trader Development' }));
    expect(await screen.findByTestId('lesson-fu-contracts-expiry')).toBeTruthy();
    expect(screen.getByText(/Add this program under Programs/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('learn-programs'));
    expect(router.push).toHaveBeenCalledWith('/learn/programs');
    await fireEvent.press(screen.getByTestId('learn-labs'));
    expect(router.push).toHaveBeenCalledWith('/labs');
  });
});

describe('Analysis labs', () => {
  it('the hub links to every lab tool', async () => {
    await renderWith(<LabsScreen />);
    await fireEvent.press(screen.getByTestId('labs-technical'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/labs/concepts/[lab]', params: { lab: 'technical' } });
    await fireEvent.press(screen.getByTestId('labs-futures-calculator'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/learn/calculators', params: { calc: 'futures_contract' } });
    for (const id of ['labs-fundamental', 'labs-companies', 'labs-red-flags', 'labs-scenarios', 'labs-markets']) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it('lists concepts by level and opens one with its chart preset, drill record and lessons', async () => {
    searchParams.current = { lab: 'technical' };
    await renderWith(<LabConceptsScreen />);
    expect(screen.getByText('Beginner')).toBeTruthy();
    expect(screen.getByText('Advanced')).toBeTruthy();
    const concept = harness.container.content.labConcepts('technical').find((c) => c.chart && c.drillKind && c.lessonIds.length > 0);
    if (!concept?.chart) throw new Error('expected a technical concept with a chart, drill and lessons');
    await fireEvent.press(screen.getByTestId(`concept-${concept.id}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/labs/concept/[id]', params: { id: concept.id } });
    await screen.unmount();

    await harness.container.practice.recordDrill({ kind: concept.drillKind as string, seed: 1, optionId: 'x', correct: true }, '2026-10-29T10:00:00.000Z' as never);
    searchParams.current = { id: concept.id };
    await renderWith(<LabConceptScreen />);
    expect(screen.getByText('When it misleads')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('concept-drill')).toHaveTextContent(/Your record: 1 of 1 right/));
    await press('Open in Chart Lab');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/practice/chart-lab',
      params: { scenario: concept.chart.scenario, overlays: concept.chart.overlays.join(','), pane: concept.chart.pane, lookFor: concept.chart.lookFor },
    });
    await fireEvent.press(screen.getByTestId(`concept-lesson-${concept.lessonIds[0]}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/lesson/[id]', params: { id: concept.lessonIds[0] } });
  });

  it('shows a missing concept plainly', async () => {
    searchParams.current = { id: 'nope' };
    await renderWith(<LabConceptScreen />);
    expect(screen.getByText('Concept not found')).toBeTruthy();
  });

  it('Chart Lab opens on a preset with what to look for', async () => {
    searchParams.current = { scenario: 'range', overlays: 'bollinger', pane: 'rsi', lookFor: 'Watch the bands' };
    await renderWith(<ChartLabScreen />);
    expect(screen.getByTestId('chart-lab-look-for')).toHaveTextContent('Watch the bands');
    expect(within(screen.getByLabelText('Scenario')).getByRole('radio', { name: 'Range' })).toBeSelected();
    expect(within(screen.getByLabelText('On the chart')).getByRole('checkbox', { name: 'Bollinger 20, 2' })).toBeChecked();
    expect(within(screen.getByLabelText('Below the chart')).getByRole('radio', { name: 'RSI 14' })).toBeSelected();
  });

  it('red-flag detector: marks every sign, shows what to investigate, and records the result', async () => {
    const item = harness.container.content.redFlagCases()[0];
    if (!item) throw new Error('expected a case');
    const flags = item.signs.filter((s) => s.isRedFlag);
    searchParams.current = { id: item.id };
    await renderWith(<RedFlagCaseScreen />);
    expect(screen.getByText(item.company, { exact: false })).toBeTruthy();
    const group = screen.getByLabelText(item.question);
    for (const s of flags.slice(1)) await fireEvent.press(within(group).getByRole('checkbox', { name: s.text.replace(/\[\[[^|\]]+\|([^\]]+)\]\]|\[\[([^\]]+)\]\]/g, '$1$2') }));
    await press('Check my red flags');
    expect(await screen.findByTestId('pick-result')).toHaveTextContent(new RegExp(`${item.signs.length - 1} of ${item.signs.length} judged correctly`));
    expect(screen.getByTestId(`verdict-${flags[0]?.id}`)).toHaveTextContent(/A warning sign you missed/);
    expect(screen.getByText('What to investigate')).toBeTruthy();
    const saved = await harness.container.labs.attempts();
    expect(saved.ok && saved.value.map((a) => [a.refId, a.score])).toEqual([[item.id, (item.signs.length - 1) / item.signs.length]]);
    await screen.unmount();

    await renderWith(<RedFlagsScreen />);
    await waitFor(() => expect(screen.getByTestId(`red-flag-case-${item.id}`)).toHaveTextContent(/best \d+%, latest \d+%/));
  });

  it('a scenario shows the release and priced-in context, then the takeaway after checking', async () => {
    const item = harness.container.content.marketScenarios('macro').find((s) => s.release);
    if (!item?.release) throw new Error('expected a macro scenario with a release');
    searchParams.current = { id: item.id };
    await renderWith(<ScenarioScreen />);
    expect(screen.getByTestId('scenario-release')).toHaveTextContent(item.release.name);
    expect(screen.getByText(`Expected (consensus): ${item.release.consensus} ${item.release.unit}`)).toBeTruthy();
    expect(screen.queryByText('Takeaway')).toBeNull();
    // With nothing picked, the button says so: choosing none is a deliberate answer.
    await press('Check my answer (I picked none)');
    expect(await screen.findByText('Takeaway')).toBeTruthy();
    await screen.unmount();

    await renderWith(<ScenariosScreen />);
    expect(screen.getByTestId(`scenario-${item.id}`)).toBeTruthy();
    await fireEvent.press(within(screen.getByLabelText('Kind of scenario')).getByRole('radio', { name: 'Commodities' }));
    const commodity = harness.container.content.marketScenarios('commodity')[0];
    expect(screen.getByTestId(`scenario-${commodity?.id}`)).toBeTruthy();
  });

  it('compares fictional companies and opens one company’s statements', async () => {
    const [a, b] = harness.container.content.companies();
    if (!a || !b) throw new Error('expected companies');
    searchParams.current = { ids: `${a.id},bogus` };
    await renderWith(<CompaniesScreen />);
    expect(screen.getByText('Fictional companies')).toBeTruthy();
    expect(screen.getByTestId(`cell-P/E ratio-${a.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`cell-P/E ratio-${b.id}`)).toBeNull();
    await fireEvent.press(within(screen.getByLabelText('Companies to compare')).getByRole('checkbox', { name: b.name }));
    expect(screen.getByTestId(`cell-P/E ratio-${b.id}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`company-${a.id}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/labs/company/[id]', params: { id: a.id } });
    await screen.unmount();

    searchParams.current = { id: a.id };
    await renderWith(<CompanyScreen />);
    expect(screen.getByText(a.name)).toBeTruthy();
    expect(screen.getByText('Business quality and risks')).toBeTruthy();
    expect(screen.getByText(`${a.years[0]?.label}: $${Math.round(a.years[0]?.revenue ?? 0).toLocaleString('en-US')}m`)).toBeTruthy();
  });

  it('compares the five markets with a caveat on every row', async () => {
    await renderWith(<MarketsScreen />);
    const rows = harness.container.content.marketComparison();
    const first = rows[0];
    if (!first) throw new Error('expected rows');
    expect(screen.getByTestId(`comparison-${first.id}-futures`)).toBeTruthy();
    expect(screen.getAllByText(/^Depends on:/)).toHaveLength(rows.length);
    await fireEvent.press(within(screen.getByLabelText('Markets to show')).getByRole('checkbox', { name: 'Futures' }));
    expect(screen.queryByTestId(`comparison-${first.id}-futures`)).toBeNull();
    expect(screen.queryByText('Choose at least one market.')).toBeNull();
    for (const name of ['Forex', 'Stocks', 'Penny stocks', 'Commodities']) {
      await fireEvent.press(within(screen.getByLabelText('Markets to show')).getByRole('checkbox', { name }));
    }
    expect(screen.getByText('Choose at least one market.')).toBeTruthy();
  });

  it('the concept list for the fundamental lab is reachable', async () => {
    searchParams.current = { lab: 'fundamental' };
    await renderWith(<LabConceptsScreen />);
    expect(screen.getByTestId('lab-concepts-fundamental')).toBeTruthy();
  });
});

describe('Futures and penny-stock lessons', () => {
  it('the futures calculator opens from a link and shows that margin is not the maximum loss', async () => {
    searchParams.current = { calc: 'futures_contract' };
    await renderWith(<CalculatorsScreen />);
    expect(screen.getByText('Futures contract')).toBeTruthy();
    expect(screen.getByText(/Losses can be larger than the margin posted/)).toBeTruthy();
    expect(screen.getByText(/Every futures contract has its own tick size/)).toBeTruthy();
  });

  it('a futures lesson shows its risk disclosure and opens the futures calculator', async () => {
    const lesson = harness.container.content.module('futures')?.lessonIds.map((id) => harness.container.content.lesson(id)).find((l) => l?.doItNow.kind === 'calculator');
    if (!lesson) throw new Error('expected a futures calculator lesson');
    searchParams.current = { id: lesson.id };
    await renderWith(<LessonScreen />);
    expect(await screen.findByText('Futures losses can exceed margin')).toBeTruthy();
    await press('Open the calculators');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/learn/calculators', params: { calc: 'futures_contract' } });
  });

  it('a fundamental-lab task opens the labs', async () => {
    const lesson = harness.container.content.module('stocks-company-analysis')?.lessonIds.map((id) => harness.container.content.lesson(id)).find((l) => l?.doItNow.kind === 'fundamental');
    if (!lesson) throw new Error('expected a fundamental lesson');
    searchParams.current = { id: lesson.id };
    await renderWith(<LessonScreen />);
    await press('Open the analysis labs');
    expect(router.push).toHaveBeenCalledWith('/labs');
    expect(screen.queryByText('Futures losses can exceed margin')).toBeNull();
  });
});
