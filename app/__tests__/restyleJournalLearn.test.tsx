import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactElement } from 'react';
import { ModuleCard } from '../../components/learning/ModuleCard';
import { QuestionCard } from '../../components/learning/QuestionCard';
import { completeOnboarding } from '../../features/learning/useCases';
import type { UtcIso } from '../../shared/time';
import type { JournalEntry } from '../../features/journal';
import { accessibilityProblems, hiddenLabelProblems, settle, type HostNode } from '../../testing/a11y';
import { resetRouterMock, routerMock, searchParams } from '../../testing/routerMock';
import { expectSimulatedFiguresBadged } from '../../testing/simulatedFigures';
import { SYNTHETIC_MT4_STATEMENT } from '../../testing/statementFixture';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import JournalEntryRoute from '../(tabs)/journal/entry/[id]';
import ImportStatementScreen from '../(tabs)/journal/import';
import JournalScreen from '../(tabs)/journal/index';
import JournalStatsScreen from '../(tabs)/journal/stats';
import LearnScreen from '../(tabs)/learn/index';
import LessonScreen from '../lesson/[id]';
/** What the journal repository stores for a new entry (the stored fields without ids, review and timestamps). */
type JournalEntryInput = Omit<JournalEntry, 'id' | 'review' | 'createdAt' | 'updatedAt'>;

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

/** Restyle stage 4: Journal and analytics (brief §5.6), Learn and lessons (§5.2). Only stored data, badged money. */
let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const root = () => screen.container as unknown as HostNode;
/** `atLeast`: the money figures the screen must show, so the badge check can never pass on an empty screen. */
const checkScreen = (atLeast: number) => {
  expect(accessibilityProblems(root())).toEqual([]);
  expect(hiddenLabelProblems(root())).toEqual([]);
  expectSimulatedFiguresBadged(root(), { atLeast });
};

const BASE: JournalEntryInput = {
  source: 'manual', sourceRef: null, externalId: null, market: 'forex', instrument: 'EURUSD', direction: 'buy', strategy: null, entry: '1.1', stop: '1.09', target: null,
  size: '0.1', sizeUnit: 'lots', exit: '1.09', pnlMoney: '-100', pnlPips: null, pnlR: '-1', plannedRisk: '100', costs: null, equityAtEntry: '10000', openedAt: null, closedAt: null,
  conditions: null, entryRationale: 'Retest', exitRationale: null, emotion: null, ruleViolations: [], noteBefore: null, noteAfter: null, screenshotUri: null, processScore: 0.8,
};

async function add(over: Partial<JournalEntryInput>, now: string): Promise<string> {
  const r = await harness.container.journal.add({ ...BASE, ...over }, now as UtcIso);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.id;
}

/** This week (from Mon 26 Oct 2026): a reviewed paper win and a clean demo loss. Last week: a demo trade with a rule broken. */
async function seed(): Promise<{ paper: string }> {
  const paper = await add({ source: 'paper', instrument: 'EUR/USD (simulated)', pnlMoney: '42.5', pnlR: '1.7' }, '2026-10-29T10:00:00.000Z');
  const review = { thesis: 'Range edge', planVsActual: 'As planned', rulesFollowed: true, resultNote: 'Hit target', lesson: 'Wait for the edge', nextGoal: 'Repeat', reviewedAt: '2026-10-29T11:00:00.000Z' as UtcIso };
  const saved = await harness.container.journal.saveReview(paper, review, 1, '2026-10-29T11:00:00.000Z' as UtcIso);
  if (!saved.ok) throw new Error(saved.error.message);
  await add({ source: 'manual', instrument: 'GBPUSD' }, '2026-10-28T10:00:00.000Z');
  await add({ source: 'replay', instrument: 'Breakout (simulated)', pnlMoney: null, pnlR: null }, '2026-10-28T09:00:00.000Z');
  await add({ source: 'manual', instrument: 'USDJPY', ruleViolations: ['no_stop'], stop: null }, '2026-10-21T10:00:00.000Z');
  return { paper };
}

describe('Journal list', () => {
  it('groups trades by day, shows process and result apart, and badges every result by source', async () => {
    await seed();
    await renderWith(<JournalScreen />);
    const rows = await screen.findAllByTestId('journal-row');
    expect(rows).toHaveLength(4);
    expect(screen.getByTestId('journal-day-2026-10-29')).toBeTruthy();
    expect(within(screen.getByTestId('journal-day-2026-10-28')).getAllByTestId('journal-row')).toHaveLength(2);
    expect(screen.getByText('Followed plan')).toBeTruthy();
    // The chip's icon shows the tick, so the words don't repeat it.
    expect(screen.queryByText(/Followed plan ✓/)).toBeNull();
    expect(screen.getByText('Broke 1 rule')).toBeTruthy();
    expect(screen.getByText('Result not recorded')).toBeTruthy();
    expect(screen.getAllByText('Demo (MT)')).toHaveLength(2);
    expect(screen.getByText('Replay')).toBeTruthy();
    // Sign and arrow for the result; the source badge is said with it; the label still ends with the subtitle.
    expect(screen.getByText('+42.50 · +1.7R')).toBeTruthy();
    expect(rows[0]!.props.accessibilityLabel).toBe(
      'Long EUR/USD (simulated). Result, gain of 42.50, 1.7 R. Followed plan. Paper trading (simulated) · process 100% · reviewed',
    );
    // The source is said once, in the subtitle; the badge is not read again inside the row's focus stop.
    for (const row of rows) expect((row.props.accessibilityLabel as string).match(/Paper|Replay|Demo|Imported/g)?.length ?? 0).toBeLessThanOrEqual(1);
    // Three results recorded (paper, two demo trades); the replay has none.
    checkScreen(3);
    await fireEvent.press(rows[0]!);
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: '/journal/entry/[id]', params: { id: expect.any(String) } });
  });

  it('says an imported trade is from a demo account, since its subtitle does not', async () => {
    await add({ source: 'mt_import', instrument: 'EURUSD', closedAt: '2026-10-29T10:00:00.000Z' as UtcIso }, '2026-10-29T12:00:00.000Z');
    await renderWith(<JournalScreen />);
    const [row] = await screen.findAllByTestId('journal-row');
    const label = row!.props.accessibilityLabel as string;
    expect(label).toContain('MetaTrader demo account, not real money');
    // The visible " · reviewed"-style ending is still the end of the spoken label.
    expect(label.endsWith(within(row!).getByText(/Imported from MT statement/).props.children as string)).toBe(true);
    checkScreen(1);
  });

  it('shows an empty state with no trades', async () => {
    await renderWith(<JournalScreen />);
    expect(await screen.findByText('No trades yet')).toBeTruthy();
    checkScreen(0);
  });
});

describe('Journal review (analytics)', () => {
  it('headlines the plan-follow rate with its change from last week, charts it, and breaks it down', async () => {
    await seed();
    await renderWith(<JournalStatsScreen />);
    expect(await screen.findByTestId('review-headline-value')).toHaveTextContent('100%');
    expect(screen.getByLabelText('Plan-follow rate, Week of 2026-10-26, 100 percent')).toBeTruthy();
    expect(screen.getByLabelText('Plan-follow rate vs Week of 2026-10-19, up 100 pts')).toBeTruthy();
    expect(screen.getByTestId('review-chart')).toBeTruthy();
    expect(screen.getByLabelText(/^Plan-follow rate by week, weeks with trades only/)).toBeTruthy();
    expect(screen.getByText('Only weeks with trades are shown, so gaps are closed up.')).toBeTruthy();
    expect(within(screen.getByTestId('review-breakdown')).getByText('No rule breaks recorded.')).toBeTruthy();
    // Results per source, each with its own badge, never added together.
    expect(screen.getByLabelText('Paper trading (simulated) net result, gain of 42.50')).toBeTruthy();
    expect(screen.getAllByLabelText('Demo trade, entered by hand net result, loss of 100.00')).toHaveLength(2); // this week and last week
    // Paper and demo this week, demo last week (the replay has no money).
    checkScreen(3);

    await fireEvent.press(within(screen.getByLabelText('Headline figure')).getByRole('radio', { name: 'Reviewed' }));
    expect(screen.getByTestId('review-headline-value')).toHaveTextContent('33%');
    expect(screen.getByLabelText('Reviewed vs Week of 2026-10-19, up 33 pts')).toBeTruthy();

    await fireEvent.press(within(screen.getByLabelText('Breakdown')).getByRole('radio', { name: 'Sources' }));
    expect(screen.getByTestId('review-source-manual')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 33, text: '1 trade' });
    checkScreen(3);

    await fireEvent.press(within(screen.getByLabelText('Period')).getByRole('radio', { name: 'Monthly' }));
    expect(screen.getByTestId('review-headline-value')).toHaveTextContent('25%'); // still the Reviewed figure: 1 of 4 October trades
    // September has no trades, so October is not compared with anything.
    expect(screen.getByText('No figure for the period before to compare with.')).toBeTruthy();
  });

  it('lists rule breaks by type for a period that has them', async () => {
    await add({ source: 'manual', ruleViolations: ['no_stop', 'daily_loss'], stop: null }, '2026-10-29T10:00:00.000Z');
    await add({ source: 'manual', ruleViolations: ['no_stop'], stop: null }, '2026-10-28T10:00:00.000Z');
    await renderWith(<JournalStatsScreen />);
    expect(await screen.findByTestId('review-rule-no_stop')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 67, text: '2×' });
    expect(screen.getByTestId('review-headline-value')).toHaveTextContent('0%');
    checkScreen(1);
  });
});

describe('Journal review edge cases', () => {
  it('says nothing about the period before when this period has no figure at all', async () => {
    // Only a replay this week: replays are not rule-checked, so there is no plan-follow rate to compare.
    await add({ source: 'replay', pnlMoney: null, pnlR: null }, '2026-10-29T10:00:00.000Z');
    await renderWith(<JournalStatsScreen />);
    expect(await screen.findByTestId('review-headline-value')).toHaveTextContent('–');
    expect(screen.queryByText('No figure for the period before to compare with.')).toBeNull();
    expect(screen.queryByTestId('review-headline-change')).toBeNull();
    checkScreen(0);
  });
});

describe('Journal entry and import', () => {
  it('names broken rules in words, not ids', async () => {
    const id = await add({ source: 'manual', ruleViolations: ['no_stop', 'daily_loss'], stop: null }, '2026-10-29T10:00:00.000Z');
    searchParams.current = { id };
    await renderWith(<JournalEntryRoute />);
    const line = await screen.findByText(/^Rules broken: /);
    expect(line).not.toHaveTextContent(/no_stop|daily_loss/);
    expect(screen.getByTestId('journal-process-chip')).toHaveProp('accessibilityLabel', 'Broke 2 rules');
    checkScreen(1);
  });

  it('shows the result with its badge apart from the process', async () => {
    const { paper } = await seed();
    searchParams.current = { id: paper };
    await renderWith(<JournalEntryRoute />);
    expect(await screen.findByTestId('journal-result')).toHaveProp('accessibilityLabel', 'Result, gain of 42.50, 1.7 R');
    expect(screen.getByTestId('journal-process-chip')).toHaveProp('accessibilityLabel', 'Followed plan');
    expect(screen.getAllByText('Paper').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('✓ You followed your plan')).toBeTruthy();
    // The process card comes before the trade details (flow 07 scrolls to it).
    const ids = root().queryAll((n) => n.props.testID === 'journal-process' || n.props.testID === 'journal-details').map((n) => n.props.testID);
    expect(ids).toEqual(['journal-process', 'journal-details']);
    checkScreen(1);
  });

  it('badges the statement preview as demo money and shows each net result with sign and arrow', async () => {
    harness.journalFiles.nextStatement = { name: 'demo.htm', text: SYNTHETIC_MT4_STATEMENT };
    await renderWith(<ImportStatementScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a statement file' }));
    expect(await screen.findAllByTestId('import-row')).toHaveLength(2);
    expect(screen.getByText('Demo (MT)')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Net result, (gain|loss) of \d/)).toHaveLength(2);
    checkScreen(2);
  });
});

describe('Learn', () => {
  it('shows the program on the light hero with progress and the finish date of the program under way', async () => {
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
    await renderWith(<LearnScreen />);
    await settle();
    expect(await screen.findByTestId('learn-hero')).toHaveTextContent(/Your program/);
    expect(screen.getByLabelText(/^Program progress, 0 of \d+ lessons and checkpoints, 0 percent\. Finishes /)).toBeTruthy();
    expect(screen.getByTestId('module-progress-forex-orders')).toHaveTextContent('0 of 4 lessons · checkpoint not passed yet');
    checkScreen(0);
  });

  it('a module with its checkpoint passed says so in words with a check; done lessons keep their tick', async () => {
    const module = {
      id: 'm',
      title: 'Orders',
      summary: '',
      practicalResult: 'Place an order',
      lessons: [
        { id: 'a', title: 'Market orders', inOneLine: 'Now', done: true },
        { id: 'b', title: 'Limit orders', inOneLine: 'Later', done: false },
      ],
      checkpointPassed: true,
    };
    await renderWith(<ModuleCard module={module} number={2} />);
    expect(screen.getByTestId('module-checkpoint-m', { includeHiddenElements: true })).toHaveTextContent('Checkpoint passed');
    expect(screen.getByTestId('module-progress-m')).toHaveTextContent('1 of 2 lessons · checkpoint passed');
    expect(StyleSheet.flatten(screen.getByTestId('module-bar-m', { includeHiddenElements: true }).props.children.props.style)).toMatchObject({ width: '50%' });
    expect(screen.getByRole('button', { name: /^Market orders\. Done\./ })).toBeTruthy();
    // Said once: the caption is read; the visible "Checkpoint passed" line is hidden from screen readers.
    expect(screen.queryByText('Checkpoint passed')).toBeNull();
    expect(screen.getByText('Checkpoint passed', { includeHiddenElements: true })).toBeTruthy();
    checkScreen(0);
  });

  it('lesson: a reading card, the worked example on a muted tile, and quiz answers as large pills', async () => {
    searchParams.current = { id: 'fx-bid-ask-spread' };
    await renderWith(<LessonScreen />);
    expect(await screen.findByTestId('lesson-reading')).toBeTruthy();
    expect(screen.getByTestId('worked-example')).toBeTruthy();
    const [link] = screen.getAllByRole('link', { name: 'bid' });
    expect(StyleSheet.flatten(link!.props.style)).toMatchObject({ textDecorationLine: 'underline' });
    const option = screen.getAllByRole('radio')[0]!;
    expect(StyleSheet.flatten(option.props.style)).toMatchObject({ minHeight: 52, alignSelf: 'stretch' });
    checkScreen(0);
  });

  it('a right answer is calm: a check and words', async () => {
    const question = { id: 'q', prompt: 'Pick A', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], multiple: false };
    await renderWith(<QuestionCard question={question} grade={(c) => ({ correct: c[0] === 'a', feedback: ['Because'] })} onFirstAttempt={() => undefined} onMastered={() => undefined} />);
    await fireEvent.press(screen.getByTestId('option-q-a'));
    expect(screen.getByRole('radio', { name: 'A' })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByText('✓ Correct')).toBeTruthy();
    checkScreen(0);
  });
});
