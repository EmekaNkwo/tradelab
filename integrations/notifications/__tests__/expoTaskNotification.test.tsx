import * as Notifications from 'expo-notifications';
import { createExpoTaskNotificationGateway, taskIdFromResponse } from '../expoTaskNotification';
import { resetNotificationHandlerForTests } from '../notificationHandler';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 2 },
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  clearLastNotificationResponse: jest.fn(),
  dismissNotificationAsync: jest.fn(async () => undefined),
  getLastNotificationResponse: jest.fn(() => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'mt-task-step'),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));

const n = jest.mocked(Notifications);
const notice = { taskId: 'mt-add-pairs', title: 'MetaTrader task in progress', body: 'Step 1 of 3.' };
const response = (data: unknown, date = 1) => ({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT', notification: { date, request: { identifier: 'mt-task-step', content: { data } } } }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  resetNotificationHandlerForTests();
  n.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
});

describe('expo task-step notification', () => {
  it('shows one ongoing, low-importance notice on its own channel, replacing any earlier one', async () => {
    const g = createExpoTaskNotificationGateway('android');
    expect(await g.show(notice, { prompt: false })).toEqual({ ok: true, value: 'shown' });
    expect(n.setNotificationChannelAsync).toHaveBeenCalledWith('mt-task-step', { name: 'MetaTrader task step', importance: 2 });
    expect(n.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'mt-task-step',
      content: { title: notice.title, body: notice.body, data: { kind: 'mt-task-step', taskId: 'mt-add-pairs' }, sticky: true, autoDismiss: true },
      trigger: { channelId: 'mt-task-step' },
    });
  });

  it('installs the foreground handler itself, without relying on the reminder gateway', async () => {
    await createExpoTaskNotificationGateway('android').show(notice, { prompt: false });
    expect(n.setNotificationHandler).toHaveBeenCalledTimes(1);
  });

  it('reports permission without prompting', async () => {
    const g = createExpoTaskNotificationGateway('android');
    expect(await g.hasPermission()).toBe(true);
    n.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    expect(await g.hasPermission()).toBe(false);
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports a tap once when the launch response and the listener both see it', () => {
    const tap = response({ kind: 'mt-task-step', taskId: 'mt-add-pairs' }, 42);
    n.getLastNotificationResponse.mockReturnValueOnce(tap);
    const opened: string[] = [];
    createExpoTaskNotificationGateway('android').onOpen((id) => opened.push(id));
    const listener = n.addNotificationResponseReceivedListener.mock.calls[0]![0];
    listener(tap);
    expect(opened).toEqual(['mt-add-pairs']);
    listener(response({ kind: 'mt-task-step', taskId: 'mt-add-pairs' }, 43));
    expect(opened).toEqual(['mt-add-pairs', 'mt-add-pairs']);
  });

  it('prompts for permission only when asked to', async () => {
    n.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    const g = createExpoTaskNotificationGateway('android');
    expect(await g.show(notice, { prompt: false })).toEqual({ ok: true, value: 'permission_denied' });
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await g.show(notice, { prompt: true })).toEqual({ ok: true, value: 'shown' });
    expect(n.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('clears by its id and reports failures as errors', async () => {
    const g = createExpoTaskNotificationGateway('android');
    expect(await g.clear()).toEqual({ ok: true, value: undefined });
    expect(n.dismissNotificationAsync).toHaveBeenCalledWith('mt-task-step');
    n.scheduleNotificationAsync.mockRejectedValueOnce(new Error('boom'));
    expect((await g.show(notice, { prompt: false })).ok).toBe(false);
  });

  it('reads only its own, well-formed taps, including the one that opened the app', () => {
    expect(taskIdFromResponse(response({ kind: 'mt-task-step', taskId: 'mt-add-pairs' }))).toBe('mt-add-pairs');
    expect(taskIdFromResponse(response({ kind: 'class', taskId: 'mt-add-pairs' }))).toBeNull();
    expect(taskIdFromResponse(response({ kind: 'mt-task-step', taskId: '../../evil' }))).toBeNull();
    expect(taskIdFromResponse(null)).toBeNull();

    n.getLastNotificationResponse.mockReturnValueOnce(response({ kind: 'mt-task-step', taskId: 'mt-read-spread' }));
    const opened: string[] = [];
    const stop = createExpoTaskNotificationGateway('android').onOpen((id) => opened.push(id));
    expect(opened).toEqual(['mt-read-spread']);
    expect(n.clearLastNotificationResponse).toHaveBeenCalled();
    const listener = n.addNotificationResponseReceivedListener.mock.calls[0]![0];
    listener(response({ kind: 'mt-task-step', taskId: 'mt-add-pairs' }, 2));
    expect(opened).toEqual(['mt-read-spread', 'mt-add-pairs']);
    stop();
  });

  it('does nothing off Android', async () => {
    const g = createExpoTaskNotificationGateway('ios');
    expect(await g.show(notice, { prompt: true })).toEqual({ ok: true, value: 'shown' });
    expect(n.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
