import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import CalculatorsScreen from '../(tabs)/learn/calculators';
import GlossaryScreen from '../(tabs)/learn/glossary';
import LearnScreen from '../(tabs)/learn/index';
import MetaTraderTasksScreen from '../(tabs)/learn/metatrader';
import GlossaryTermScreen from '../glossary/[id]';
import LessonScreen from '../lesson/[id]';
import MtTaskScreen from '../mt-task/[id]';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

describe('Learn tab', () => {
  it('lists the three forex modules with progress and opens a lesson', async () => {
    await renderWith(<LearnScreen />);
    expect(await screen.findByText('Practical Forex Trader')).toBeTruthy();
    expect(screen.getByTestId('module-progress-forex-orders')).toHaveTextContent('0 of 4 lessons · checkpoint not passed yet');
    await fireEvent.press(screen.getByTestId('lesson-fx-bid-ask-spread'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/lesson/[id]', params: { id: 'fx-bid-ask-spread' } });
    // Content link markup never reaches the screen or screen readers.
    expect(JSON.stringify(screen.toJSON())).not.toContain('[[');
    await fireEvent.press(screen.getByTestId('learn-calculators'));
    expect(router.push).toHaveBeenCalledWith('/learn/calculators');
  });
});

describe('Lesson reader', () => {
  it('shows the lesson with tappable glossary terms and a link to the guided MetaTrader task', async () => {
    searchParams.current = { id: 'fx-bid-ask-spread' };
    await renderWith(<LessonScreen />);
    expect(await screen.findByText('Bid, ask, and the spread')).toBeTruthy();
    const [bidLink] = screen.getAllByRole('link', { name: 'bid' });
    await fireEvent.press(bidLink!);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/glossary/[id]', params: { id: 'bid' } });
    await press('Open the guided MetaTrader task');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/mt-task/[id]', params: { id: 'mt-read-spread' } });
    expect(screen.getByText(/These answers are not scored/)).toBeTruthy();
  });

  it('shows an error for an unknown lesson', async () => {
    searchParams.current = { id: 'nope' };
    await renderWith(<LessonScreen />);
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});

describe('Glossary', () => {
  it('searches and opens a term with related terms', async () => {
    await renderWith(<GlossaryScreen />);
    await fireEvent.changeText(screen.getByTestId('glossary-search'), 'slipp');
    await fireEvent.press(await screen.findByTestId('term-slippage'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/glossary/[id]', params: { id: 'slippage' } });
    await fireEvent.changeText(screen.getByTestId('glossary-search'), 'qqqq');
    expect(await screen.findByText('No matching terms')).toBeTruthy();
  });

  it('term page shows the definition and related terms', async () => {
    searchParams.current = { id: 'pip' };
    await renderWith(<GlossaryTermScreen />);
    expect(await screen.findByText('Pip')).toBeTruthy();
    expect(screen.getByText('Related terms')).toBeTruthy();
  });

  it('term page says when a term is unknown', async () => {
    searchParams.current = { id: 'not-a-term' };
    await renderWith(<GlossaryTermScreen />);
    expect(await screen.findByText('Term not found')).toBeTruthy();
  });
});

describe('Calculators', () => {
  it('computes from example values, recomputes on edit, and explains bad input', async () => {
    await renderWith(<CalculatorsScreen />);
    expect((await screen.findAllByText('1.00 USD')).length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByTestId('field-lots'), '1');
    expect((await screen.findAllByText('10.00 USD')).length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByTestId('field-lots'), 'abc');
    expect(await screen.findByTestId('calculator-error')).toHaveTextContent('Size (lots) must be a number');
  });

  it('switches calculator and asks for a rate on cross pairs', async () => {
    await renderWith(<CalculatorsScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Margin required' }));
    expect(await screen.findByText('366.67 USD')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('field-pair'), 'EUR/GBP');
    expect(await screen.findByTestId('field-baseToAccountRate')).toBeTruthy();
  });
});

describe('MetaTrader tasks', () => {
  it('lists tasks', async () => {
    await renderWith(<MetaTraderTasksScreen />);
    await fireEvent.press(await screen.findByTestId('mt-task-mt-add-pairs'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/mt-task/[id]', params: { id: 'mt-add-pairs' } });
  });

  it('an order task needs demo confirmation, every step, and the questions before it can be marked done', async () => {
    searchParams.current = { id: 'mt-demo-trade-sl-tp' };
    await renderWith(<MtTaskScreen />);
    const done = await screen.findByRole('button', { name: 'Mark task as done' });
    expect(done).toBeDisabled();
    expect(screen.getByTestId('mt-task-blocked')).toHaveTextContent(/demo account/);

    await press('Do it in MetaTrader');
    expect(harness.apps.launched).toEqual(['mt5']);

    await fireEvent.press(screen.getByRole('checkbox', { name: "I'm on a demo account" }));
    const task = harness.container.content.mtTask('mt-demo-trade-sl-tp')!;
    for (let i = 0; i < task.steps.length; i += 1) {
      await fireEvent.press(screen.getByRole('checkbox', { name: new RegExp(`^${i + 1}\\. `) }));
    }
    expect(screen.getByTestId('mt-task-blocked')).toHaveTextContent(/questions/);

    await fireEvent.press(screen.getByRole('radio', { name: 'The bid' }));
    await press('Check answer');
    await press('Next question');
    await fireEvent.press(screen.getByRole('radio', { name: 'The spread' }));
    await press('Check answer');
    await press('Finish questions');

    await press('Mark task as done');
    expect(await screen.findByText('Task recorded')).toBeTruthy();
    expect(await harness.container.mtTasks.draft('mt-demo-trade-sl-tp')).toEqual({ ok: true, value: null });
    expect(screen.getByText('Demo account confirmed by you.')).toBeTruthy();
    const saved = await harness.container.mtTasks.completions('mt-demo-trade-sl-tp');
    expect(saved.ok && saved.value[0]).toMatchObject({ platform: 'mt5', score: 1 });
  });

  it('saves ticked steps as the learner goes', async () => {
    searchParams.current = { id: 'mt-add-pairs' };
    await renderWith(<MtTaskScreen />);
    await fireEvent.press(await screen.findByRole('checkbox', { name: /^1\. / }));
    await waitFor(async () => {
      const d = await harness.container.mtTasks.draft('mt-add-pairs');
      expect(d.ok && d.value?.stepsDone).toEqual([0]);
    });
  });

  it('resumes a saved run (e.g. after Android closed TradeLab while in MetaTrader)', async () => {
    const task = harness.container.content.mtTask('mt-add-pairs')!;
    const firstQuestion = task.afterQuestions[0]!;
    await harness.container.mtTasks.saveDraft(
      'mt-add-pairs',
      { platform: 'mt4', demoConfirmed: false, stepsDone: [0, 1], answers: { [firstQuestion.id]: firstQuestion.correctOptionIds }, note: 'halfway' },
      '2026-10-29T10:00:00.000Z' as never,
    );
    searchParams.current = { id: 'mt-add-pairs' };
    await renderWith(<MtTaskScreen />);
    expect(await screen.findByRole('checkbox', { name: /^2\. /, checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'MT4', selected: true })).toBeTruthy();
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.getByDisplayValue('halfway')).toBeTruthy();
  });

  it('offers Google Play when the chosen MetaTrader is not installed', async () => {
    searchParams.current = { id: 'mt-add-pairs' };
    await renderWith(<MtTaskScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'MT4' }));
    await press('Do it in MetaTrader');
    expect(await screen.findByText('MT4 is not installed')).toBeTruthy();
    await press('Open Google Play');
    expect(harness.apps.opened).toEqual(['mt4']);
  });
});
