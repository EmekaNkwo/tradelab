import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import type { ReactElement } from 'react';
import { completeOnboarding, finishClass, type OnboardingInput } from '../../features/learning/useCases';
import { createTestHarness, movableClock, TestProviders, type TestHarness } from '../../testing/testContainer';
import { resetRouterMock, routerMock as router, searchParams } from '../../testing/routerMock';
import ClassScreen from '../class/[id]';
import HomeScreen from '../(tabs)/home/index';
import ProgramScreen from '../(tabs)/home/program';
import OnboardingScreen from '../onboarding';
import ReviewScreen from '../review';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
let clock: ReturnType<typeof movableClock>;
beforeEach(async () => {
  clock = movableClock();
  harness = await createTestHarness(undefined, clock);
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);
const press = async (name: string | RegExp) => fireEvent.press(await screen.findByRole('button', { name }));

const ONBOARDING: OnboardingInput = {
  riskAcknowledged: true,
  experience: 'complete_beginner',
  markets: ['forex'],
  goals: ['understand_markets'],
  explanationLevel: 'simple',
  metaTrader: null,
  timeZone: 'Africa/Lagos',
  programId: 'practical-forex-trader',
  settings: { startDate: '2026-10-29' as never, timeline: { kind: 'weeks', weeks: 4 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
  classTime: '19:00',
  remindersEnabled: true,
  placementPassedModuleIds: [],
};

async function onboard() {
  const r = await completeOnboarding(harness.container, ONBOARDING);
  if (!r.ok) throw new Error(r.error.message);
  const classes = await harness.container.learning.classes(r.value.id);
  if (!classes.ok) throw new Error(classes.error.message);
  return { enrolment: r.value, classes: classes.value };
}

/** Picks the right answer for whatever question is showing (the test knows the content's answer keys). */
async function answerShownQuestion(correct: boolean) {
  const questions = [...harness.container.content.programs()].flatMap(() =>
    ['fx-currency-pairs', 'fx-pair-types', 'fx-bid-ask-spread', 'fx-sessions'].flatMap((id) => harness.container.content.lesson(id)?.quickCheck ?? []),
  );
  const checkpoint = harness.container.content.quiz('forex-basics-checkpoint')?.questions ?? [];
  const shown = [...questions, ...checkpoint].find((q) => screen.queryByText(q.prompt));
  if (!shown) throw new Error('no known question on screen');
  const ids = correct ? shown.correctOptionIds : [shown.options.find((o) => !shown.correctOptionIds.includes(o.id))!.id];
  for (const id of ids) {
    const option = shown.options.find((o) => o.id === id)!;
    await fireEvent.press(screen.getByRole(shown.correctOptionIds.length > 1 ? 'checkbox' : 'radio', { name: option.text }));
  }
  await press('Check answer');
}

describe('Onboarding', () => {
  it('walks every step, previews the plan, and enrols the learner', async () => {
    await renderWith(<OnboardingScreen />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    await press('Continue');

    await fireEvent.press(screen.getByRole('radio', { name: 'Complete beginner' }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Forex' }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Risk management' }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('radio', { name: 'Balanced' }));
    await press('Continue');

    await press('Get MT5 on Google Play');
    expect(harness.apps.opened).toEqual(['mt5']);
    await press('Continue');

    expect(await screen.findByTestId('plan-preview')).toHaveTextContent(/\d+ classes/);
    await fireEvent.press(screen.getByRole('radio', { name: '2 weeks' }));
    await press('Continue');
    await press('Start learning');

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    const profile = await harness.container.profile.get();
    expect(profile.ok && profile.value).toMatchObject({ experience: 'complete_beginner', goals: ['risk_management'], explanationLevel: 'balanced' });
    const enrolment = await harness.container.learning.currentEnrolment();
    expect(enrolment.ok && enrolment.value?.settings.timeline).toEqual({ kind: 'weeks', weeks: 2 });
    expect(harness.reminders.latest()?.slots).toHaveLength(5);
  });

  it('opens each step at the top, not at the previous step’s scroll position', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    try {
      await renderWith(<OnboardingScreen />);
      await fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
      scrollTo.mockClear();
      await press('Continue');
      expect(screen.getByText('Step 2 of 8')).toBeTruthy();
      expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: false });
      scrollTo.mockClear();
      await press('Back');
      expect(screen.getByText('Step 1 of 8')).toBeTruthy();
      expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: false });
      scrollTo.mockClear();
      // Answering within a step does not jump the screen.
      await fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      scrollTo.mockRestore();
    }
  });

  it('a placement checkpoint pass removes the module from the plan', async () => {
    await renderWith(<OnboardingScreen />);
    await fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('radio', { name: 'I know basic terms' }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Forex' }));
    await press('Continue');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Understand markets' }));
    for (let i = 0; i < 4; i += 1) await press('Continue');

    const planSize = () => Number(/Your plan: (\d+) classes/.exec(String(screen.getByText(/^Your plan:/).props.children))?.[1]);
    const before = planSize();
    await press('Test out of Forex basics');
    for (let i = 0; i < 5; i += 1) {
      await answerShownQuestion(true);
      await press(i === 4 ? 'Finish' : 'Next question');
    }
    expect(await screen.findByText('Module skipped')).toBeTruthy();
    // Module 1 was 4 lessons, a checkpoint, and a review class.
    expect(planSize()).toBeLessThanOrEqual(before - 5);
  });
});

describe('Home', () => {
  it("offers today's class and opens it", async () => {
    const { classes } = await onboard();
    await renderWith(<HomeScreen />);
    await press("Start today's class");
    expect(router.push).toHaveBeenCalledWith(`/class/${classes[0]!.id}`);
    expect(await screen.findByText("Today's missions")).toBeTruthy();
    expect(screen.getByTestId('program-status')).toHaveTextContent('On track');
  });

  it('offers to schedule lessons added after enrolling (a content update)', async () => {
    const { enrolment } = await onboard();
    // Simulate an enrolment made before module 3 shipped: its classes do not exist.
    await harness.db.runAsync("DELETE FROM daily_class WHERE module_id = 'forex-orders'", []);
    await renderWith(<HomeScreen />);
    expect(await screen.findByText('New lessons were added')).toBeTruthy();
    await press('Add them to my schedule');
    await waitFor(async () => {
      const classes = await harness.container.learning.classes(enrolment.id);
      expect(classes.ok && classes.value.some((c) => c.moduleId === 'forex-orders')).toBe(true);
    });
    await waitFor(() => expect(screen.queryByText('New lessons were added')).toBeNull());
  });

  it('shows behind status after missed days and links to catch-up', async () => {
    await onboard();
    clock.set('2026-11-04T10:00:00.000Z');
    await renderWith(<HomeScreen />);
    expect(await screen.findByText('You are behind')).toBeTruthy();
    await press('Catch up');
    expect(router.push).toHaveBeenCalledWith('/home/program');
  });
});

describe('Daily class', () => {
  it('runs a lesson class end to end: learn, worked example buttons, practice, retry quiz, summary', async () => {
    const { classes } = await onboard();
    const cls = classes[0]!;
    searchParams.current = { id: cls.id };
    await renderWith(<ClassScreen />);

    expect(await screen.findByText('Currency pairs: base and quote')).toBeTruthy();
    await press('Explain more simply');
    expect(screen.getByText(/one euro costs 1.10 dollars/)).toBeTruthy();
    await press('Continue');

    expect(await screen.findByText('Do it now')).toBeTruthy();
    await press("I've done this");

    await answerShownQuestion(false);
    await press('Why was I wrong?');
    await press('Let me try again');
    await answerShownQuestion(true);
    await press('Next question');
    await answerShownQuestion(true);
    await press('Finish');
    await press('Continue');

    expect(await screen.findByText('Class summary')).toBeTruthy();
    await press('Finish class');
    expect(await screen.findByRole('button', { name: 'Back to Home' })).toBeTruthy();

    const saved = await harness.container.learning.getClass(cls.id);
    expect(saved.ok && saved.value).toMatchObject({ status: 'completed', score: 0.5 });
    const done = await harness.container.learning.completedUnitIds(cls.enrolmentId);
    expect(done.ok && [...done.value]).toEqual(['forex-basics:fx-currency-pairs']);
  });

  it('finishing a class with a warm-up keeps the summary on screen (review regression)', async () => {
    const { classes } = await onboard();
    const lesson = harness.container.content.lesson('fx-currency-pairs')!;
    const wrong = Object.fromEntries(lesson.quickCheck.map((q) => [q.id, ['b']]));
    const { gradeQuestions } = jest.requireActual<typeof import('../../domain/learning')>('../../domain/learning');
    await finishClass(harness.container, classes[0]!, {
      warmup: [],
      lessonChecks: [{ lessonId: lesson.id, firstAttempt: wrong, firstResult: gradeQuestions(lesson.quickCheck, wrong, 1), mastered: true }],
      checkpoint: null,
    });
    clock.set('2026-10-30T10:00:00.000Z');
    searchParams.current = { id: classes[1]!.id };
    await renderWith(<ClassScreen />);
    expect(await screen.findByTestId('section-progress')).toHaveTextContent('Warm-up review · 1 of 6');
    await answerShownQuestion(true);
    await press('Next question');
    await answerShownQuestion(true);
    await press('Finish');
    await press('Continue');
    await press('Continue');
    await press("I've done this");
    for (let i = 0; i < 2; i += 1) {
      await answerShownQuestion(true);
      await press(i === 1 ? 'Finish' : 'Next question');
    }
    await press('Continue');
    await press("I'll do it later");
    await press('Finish class');
    expect(await screen.findByRole('button', { name: 'Back to Home' })).toBeTruthy();
    expect(screen.getByText('Class summary')).toBeTruthy();
    expect(await harness.db.getAllAsync("SELECT * FROM quiz_attempt WHERE ref_id = 'fx-pair-types'", [])).toHaveLength(1);
  });

  it('pausing keeps the place; resuming never skips the quiz', async () => {
    const { classes } = await onboard();
    const cls = classes[0]!;
    searchParams.current = { id: cls.id };
    await harness.container.learning.saveSectionProgress(cls.id, 3);
    await renderWith(<ClassScreen />);
    expect(await screen.findByTestId('section-progress')).toHaveTextContent('Recap quiz · 3 of 4');
  });

  it('saves notes', async () => {
    const { classes } = await onboard();
    searchParams.current = { id: classes[0]!.id };
    await renderWith(<ClassScreen />);
    await fireEvent.changeText(await screen.findByTestId('note-input'), 'Base first, quote second');
    await press('Save note');
    expect(await screen.findByText('Base first, quote second')).toBeTruthy();
  });

  it('a failed checkpoint shows what was missed and can be retaken', async () => {
    const { classes } = await onboard();
    const cls = classes.find((c) => c.kind === 'checkpoint')!;
    searchParams.current = { id: cls.id };
    await renderWith(<ClassScreen />);
    expect(await screen.findByText('Module checkpoint')).toBeTruthy();
    for (let i = 0; i < 5; i += 1) {
      await answerShownQuestion(false);
      await press(i === 4 ? 'Finish' : 'Next question');
    }
    expect(await screen.findByText('Not passed yet')).toBeTruthy();
    await press('Try the checkpoint again');
    for (let i = 0; i < 5; i += 1) {
      await answerShownQuestion(true);
      await press(i === 4 ? 'Finish' : 'Next question');
    }
    expect(await screen.findByText('Checkpoint passed')).toBeTruthy();
    const saved = await harness.container.learning.getClass(cls.id);
    expect(saved.ok && saved.value.status).toBe('completed');
  });
});

describe('Program screen', () => {
  it('previews catch-up choices and applies one', async () => {
    const { enrolment } = await onboard();
    clock.set('2026-11-04T10:00:00.000Z');
    await renderWith(<ProgramScreen />);
    expect(await screen.findByText('Extend the finish date')).toBeTruthy();
    const [extend] = await screen.findAllByRole('button', { name: 'Choose this' });
    await fireEvent.press(extend!);
    await waitFor(async () => {
      const classes = await harness.container.learning.classes(enrolment.id);
      expect(classes.ok && classes.value.every((c) => c.date >= '2026-11-04')).toBe(true);
    });
  });

  it('pauses and resumes', async () => {
    const { enrolment } = await onboard();
    clock.set('2026-11-04T10:00:00.000Z'); // behind before pausing
    await renderWith(<ProgramScreen />);
    expect(await screen.findByTestId('program-status')).toHaveTextContent(/behind/);
    await press('Pause program');
    await waitFor(async () => {
      const e = await harness.container.learning.currentEnrolment();
      expect(e.ok && e.value?.status).toBe('paused');
    });
    await waitFor(() => expect(screen.getByTestId('program-status')).toHaveTextContent(/^On track/));
    await press('Resume program');
    await waitFor(async () => {
      const e = await harness.container.learning.currentEnrolment();
      expect(e.ok && e.value).toMatchObject({ id: enrolment.id, status: 'active' });
    });
  });

  it('tells the learner when notifications are blocked', async () => {
    await onboard();
    harness.reminders.outcome = 'permission_denied';
    await renderWith(<ProgramScreen />);
    await fireEvent.press((await screen.findAllByRole('radio', { name: 'On' }))[0]!);
    expect(await screen.findByText(/Turn them on in Android settings/)).toBeTruthy();
  });
});

describe('Review', () => {
  it('reviews due concepts and saves the result', async () => {
    const { classes } = await onboard();
    const cls = classes[0]!;
    const lesson = harness.container.content.lesson('fx-currency-pairs')!;
    const wrong = Object.fromEntries(lesson.quickCheck.map((q) => [q.id, ['b']]));
    const { gradeQuestions } = jest.requireActual<typeof import('../../domain/learning')>('../../domain/learning');
    await finishClass(harness.container, cls, {
      warmup: [],
      lessonChecks: [{ lessonId: lesson.id, firstAttempt: wrong, firstResult: gradeQuestions(lesson.quickCheck, wrong, 1), mastered: true }],
      checkpoint: null,
    });
    clock.set('2026-10-30T10:00:00.000Z');
    await renderWith(<ReviewScreen />);
    await answerShownQuestion(true);
    await press('Next question');
    await answerShownQuestion(true);
    await press('Finish');
    expect(await screen.findByText('2 of 2 right first time.')).toBeTruthy();
  });

  it('says when nothing is due', async () => {
    await onboard();
    await renderWith(<ReviewScreen />);
    expect(await screen.findByText('Nothing to review')).toBeTruthy();
  });
});
