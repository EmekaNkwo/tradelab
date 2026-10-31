import * as Notifications from 'expo-notifications';
import type { ReminderPlan } from '../../../data/reminders/types';
import { createExpoReminderGateway } from '../expoReminders';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly' },
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));

const n = jest.mocked(Notifications);
const plan = (o: Partial<ReminderPlan> = {}): ReminderPlan => ({ kind: 'class', title: 'T', body: 'B', slots: [{ weekday: 0, hour: 19, minute: 30 }], ...o });

beforeEach(() => {
  jest.clearAllMocks();
  n.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
});

describe('expo reminder gateway', () => {
  it('maps weekdays 0 (Sunday) … 6 (Saturday) to expo 1 … 7 on the learning channel', async () => {
    const g = createExpoReminderGateway('ios');
    const result = await g.sync([plan({ slots: [{ weekday: 0, hour: 19, minute: 30 }, { weekday: 6, hour: 8, minute: 0 }] })], { prompt: false });
    expect(result).toEqual({ ok: true, value: 'scheduled' });
    expect(n.setNotificationChannelAsync).toHaveBeenCalledWith('class-reminders', expect.objectContaining({ name: 'Learning reminders' }));
    const triggers = n.scheduleNotificationAsync.mock.calls.map(([req]) => req.trigger);
    expect(triggers).toEqual([
      { type: 'weekly', channelId: 'class-reminders', weekday: 1, hour: 19, minute: 30 },
      { type: 'weekly', channelId: 'class-reminders', weekday: 7, hour: 8, minute: 0 },
    ]);
  });

  it('only shows the permission prompt when asked to', async () => {
    n.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    const g = createExpoReminderGateway('android');
    expect(await g.sync([plan()], { prompt: false })).toEqual({ ok: true, value: 'permission_denied' });
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await g.sync([plan()], { prompt: true })).toEqual({ ok: true, value: 'scheduled' });
    expect(n.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('reports a denial without asking again when the system will not show the prompt', async () => {
    n.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    expect(await createExpoReminderGateway('ios').sync([plan()], { prompt: true })).toEqual({ ok: true, value: 'permission_denied' });
    expect(n.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(n.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('clears everything for an empty plan list without touching permissions', async () => {
    expect(await createExpoReminderGateway('ios').sync([], { prompt: true })).toEqual({ ok: true, value: 'cleared' });
    expect(n.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(n.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('cancels again when scheduling fails part-way, so no half set is left', async () => {
    n.scheduleNotificationAsync.mockRejectedValueOnce(new Error('boom'));
    const result = await createExpoReminderGateway('ios').sync([plan()], { prompt: false });
    expect(!result.ok && result.error.kind).toBe('ProviderUnavailable');
    expect(n.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2);
  });

  it('runs syncs one after another so their cancel and schedule calls never interleave', async () => {
    const order: string[] = [];
    n.cancelAllScheduledNotificationsAsync.mockImplementation(async () => {
      order.push('cancel');
    });
    n.scheduleNotificationAsync.mockImplementation(async (req) => {
      await Promise.resolve();
      order.push(`schedule:${req.content.title}`);
      return 'id';
    });
    const g = createExpoReminderGateway('ios');
    await Promise.all([g.sync([plan({ title: 'A' })], { prompt: false }), g.sync([plan({ title: 'B' })], { prompt: false })]);
    expect(order).toEqual(['cancel', 'schedule:A', 'cancel', 'schedule:B']);
  });

  it('does nothing on web', async () => {
    expect(await createExpoReminderGateway('web').sync([plan()], { prompt: true })).toEqual({ ok: true, value: 'cleared' });
    expect(n.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });
});
