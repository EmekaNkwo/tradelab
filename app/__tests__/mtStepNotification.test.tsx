import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { TaskNotificationTaps } from '../../components/navigation/TaskNotificationTaps';
import { completeOnboarding } from '../../features/learning/useCases';
import { serialised, taskStepNotice } from '../../features/metatrader/taskStepNotification';
import { resetRouterMock, routerMock, searchParams } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import MtTaskScreen from '../mt-task/[id]';

/** The root navigator's readiness and the current path, which the tap handler waits on after a cold start. */
const nav: { key: string | undefined; pathname: string } = { key: 'root', pathname: '/home' };
jest.mock('expo-router', () => ({
  ...jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule(),
  useRootNavigationState: () => (nav.key ? { key: nav.key } : undefined),
  usePathname: () => nav.pathname,
}));


const TASK = 'mt-add-pairs';
const TOGGLE = 'Show the current step in a notification while you are in MetaTrader';

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
  searchParams.current = { id: TASK };
  nav.key = 'root';
  nav.pathname = '/home';
});

const ONBOARDING = {
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
} as const;
async function onboard() {
  const r = await completeOnboarding(harness.container, ONBOARDING as never);
  if (!r.ok) throw new Error(r.error.message);
}
const renderTaps = () =>
  render(
    <TestProviders container={harness.container}>
      <TaskNotificationTaps />
    </TestProviders>,
  );
afterEach(() => harness.db.close());

const renderTask = () =>
  render(
    <TestProviders container={harness.container}>
      <MtTaskScreen />
    </TestProviders>,
  );
const turn = async (value: 'On' | 'Off') => fireEvent.press(within(screen.getByLabelText(TOGGLE)).getByRole('radio', { name: value }));

describe('MetaTrader step notification (spec §11, §37.2)', () => {
  it('is off by default: opening a task shows nothing and asks for nothing', async () => {
    await renderTask();
    expect(await screen.findByLabelText(TOGGLE)).toBeTruthy();
    expect(within(screen.getByLabelText(TOGGLE)).getByRole('radio', { name: 'Off' })).toBeSelected();
    expect(harness.taskNotifications.shown).toEqual([]);
  });

  it('gives the platform and notification segments stable ids for the device flows', async () => {
    await renderTask();
    await screen.findByLabelText(TOGGLE);
    for (const id of ['mt-platform-mt4', 'mt-platform-mt5', 'mt-step-notice-off', 'mt-step-notice-on']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it('asks for permission only when turned on, then follows the current step and clears when the learner leaves', async () => {
    const view = await renderTask();
    await screen.findByLabelText(TOGGLE);
    await turn('On');
    expect(harness.taskNotifications.shown[0]).toEqual({ notice: expect.objectContaining({ taskId: TASK }), prompt: true });
    await waitFor(async () => {
      const s = await harness.container.settings.get();
      expect(s.ok && s.value.mtStepNotification).toBe(true);
    });
    expect(harness.taskNotifications.current?.body).toMatch(/^Step 1 of \d+\./);
    expect(harness.taskNotifications.shown.slice(1).every((s) => !s.prompt)).toBe(true);

    await fireEvent.press(screen.getByRole('checkbox', { name: /^1\. / }));
    await waitFor(() => expect(harness.taskNotifications.current?.body).toMatch(/^Step 2 of \d+\./));

    await view.unmount();
    await waitFor(() => expect(harness.taskNotifications.current).toBeNull());
  });

  it('keeps the setting off and says so when permission is refused', async () => {
    harness.taskNotifications.permission = 'denied';
    await renderTask();
    await screen.findByLabelText(TOGGLE);
    await turn('On');
    expect(await screen.findByTestId('mt-step-notice-denied')).toBeTruthy();
    const s = await harness.container.settings.get();
    expect(s.ok && s.value.mtStepNotification).toBe(false);
    expect(harness.taskNotifications.current).toBeNull();
  });

  it('clears when turned off', async () => {
    await harness.container.settings.update({ mtStepNotification: true }, '2026-10-29T10:00:00.000Z' as never);
    harness.taskNotifications.permission = 'granted';
    await renderTask();
    await waitFor(() => expect(harness.taskNotifications.current).not.toBeNull());
    await turn('Off');
    await waitFor(() => expect(harness.taskNotifications.current).toBeNull());
  });

  it('tapping the notification opens that task and clears the notice', async () => {
    await onboard();
    harness.taskNotifications.permission = 'granted';
    await harness.taskNotifications.show(taskStepNotice(harness.container.content.mtTask(TASK)!, new Set()), { prompt: false });
    await renderTaps();
    await act(async () => harness.taskNotifications.tap(TASK));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith({ pathname: '/mt-task/[id]', params: { id: TASK } }));
    expect(harness.taskNotifications.current).toBeNull();
  });

  it('on a cold start, waits for the navigator and the start redirect before opening the task', async () => {
    await onboard();
    nav.key = undefined;
    nav.pathname = '/';
    const view = await renderTaps();
    await act(async () => harness.taskNotifications.tap(TASK));
    expect(routerMock.push).not.toHaveBeenCalled();
    nav.key = 'root';
    await view.rerender(
      <TestProviders container={harness.container}>
        <TaskNotificationTaps />
      </TestProviders>,
    );
    expect(routerMock.push).not.toHaveBeenCalled();
    nav.pathname = '/home';
    await view.rerender(
      <TestProviders container={harness.container}>
        <TaskNotificationTaps />
      </TestProviders>,
    );
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
  });

  it('does not open a task for a learner who has not finished setting up', async () => {
    await renderTaps();
    await act(async () => harness.taskNotifications.tap(TASK));
    await act(async () => undefined);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('turns itself off and says so when permission is taken away later', async () => {
    await harness.container.settings.update({ mtStepNotification: true }, '2026-10-29T10:00:00.000Z' as never);
    harness.taskNotifications.permission = 'denied';
    await renderTask();
    expect(await screen.findByTestId('mt-step-notice-denied')).toBeTruthy();
    await waitFor(async () => {
      const s = await harness.container.settings.get();
      expect(s.ok && s.value.mtStepNotification).toBe(false);
    });
    expect(harness.taskNotifications.shown.every((x) => !x.prompt)).toBe(true);
  });

  it('runs show and clear in order, so a fast unmount never leaves the notice up', async () => {
    const g = harness.taskNotifications;
    g.permission = 'granted';
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slowShow = serialised(g, async () => {
      await gate;
      return g.show({ taskId: TASK, title: 't', body: 'b' }, { prompt: false });
    });
    const clear = serialised(g, () => g.clear());
    release();
    await Promise.all([slowShow, clear]);
    expect(g.current).toBeNull();
  });

  it('never mentions trades, prices or signals, for any shipped task at any step', () => {
    for (const task of harness.container.content.mtTasks()) {
      for (let done = 0; done <= task.steps.length; done += 1) {
        const n = taskStepNotice(task, new Set(Array.from({ length: done }, (_, i) => i)));
        expect(`${n.title} ${n.body}`).not.toMatch(/\btrad(e|es|ing)\b|price|signal|buy|sell/i);
        // Nothing from the task's own wording reaches the notice: only fixed text and step numbers.
        expect(n.title).toBe('MetaTrader task in progress');
        expect(n.body).toMatch(/^(Step \d+ of \d+\. Tap to go back to the task in TradeLab\.|All steps ticked\. Tap to answer the questions in TradeLab\.)$/);
        expect(`${n.title} ${n.body}`).not.toContain(task.title);
      }
    }
  });
});
