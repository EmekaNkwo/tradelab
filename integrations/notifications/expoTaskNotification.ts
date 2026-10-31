import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  clearLastNotificationResponse,
  dismissNotificationAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  type NotificationResponse,
} from 'expo-notifications';
import { Platform } from 'react-native';
import type { TaskNotificationGateway, TaskNoticeOutcome } from '../../data/reminders/taskNotification';
import { fromUnknown } from '../../shared/errors';
import { err, ok } from '../../shared/result';
import { installNotificationHandler } from './notificationHandler';

/** Its own channel, so the learner can turn it off in Android settings without losing class reminders. */
const CHANNEL_ID = 'mt-task-step';
/** One fixed id: showing again replaces the notice instead of stacking a new one. */
const NOTICE_ID = 'mt-task-step';
const KIND = 'mt-task-step';
const TASK_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** The task id a tap refers to, or null for any other notification or a malformed payload. */
export function taskIdFromResponse(response: NotificationResponse | null | undefined): string | null {
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  if (!data || data.kind !== KIND || typeof data.taskId !== 'string') return null;
  return TASK_ID.test(data.taskId) ? data.taskId : null;
}

/** Identifies one tap: the notice id is fixed, so the delivery time tells taps on different notices apart. */
const responseKey = (r: NotificationResponse): string => `${r.notification.request.identifier}:${r.notification.date}:${r.actionIdentifier}`;

async function ensurePermission(prompt: boolean): Promise<boolean> {
  // Low importance: no sound or pop-up, it just sits in the shade while the learner works in MetaTrader.
  await setNotificationChannelAsync(CHANNEL_ID, { name: 'MetaTrader task step', importance: AndroidImportance.LOW });
  const current = await getPermissionsAsync();
  if (current.granted) return true;
  if (!prompt || !current.canAskAgain) return false;
  return (await requestPermissionsAsync()).granted;
}

export function createExpoTaskNotificationGateway(platform: string = Platform.OS): TaskNotificationGateway {
  // Ongoing notifications are an Android feature; elsewhere the setting simply does nothing.
  const supported = platform === 'android';
  const seen = new Set<string>();
  return {
    async show(notice, options) {
      if (!supported) return ok<TaskNoticeOutcome>('shown');
      try {
        installNotificationHandler();
        if (!(await ensurePermission(options.prompt))) return ok<TaskNoticeOutcome>('permission_denied');
        await scheduleNotificationAsync({
          identifier: NOTICE_ID,
          // Sticky so a swipe does not lose it mid-task; a tap still dismisses it, since it opens the task.
          content: { title: notice.title, body: notice.body, data: { kind: KIND, taskId: notice.taskId }, sticky: true, autoDismiss: true },
          trigger: { channelId: CHANNEL_ID },
        });
        return ok<TaskNoticeOutcome>('shown');
      } catch (cause) {
        return err(fromUnknown('ProviderUnavailable', 'Showing the task notification failed', cause));
      }
    },
    async clear() {
      if (!supported) return ok(undefined);
      try {
        await dismissNotificationAsync(NOTICE_ID);
        return ok(undefined);
      } catch (cause) {
        return err(fromUnknown('ProviderUnavailable', 'Clearing the task notification failed', cause));
      }
    },
    async hasPermission() {
      if (!supported) return true;
      try {
        return (await getPermissionsAsync()).granted;
      } catch {
        return false;
      }
    },
    onOpen(listener) {
      if (!supported) return () => undefined;
      const deliver = (response: NotificationResponse | null | undefined) => {
        const taskId = taskIdFromResponse(response);
        if (!taskId || !response) return;
        const key = responseKey(response);
        if (seen.has(key)) return;
        seen.add(key);
        listener(taskId);
      };
      // A tap that launched the app arrives before any listener exists; read it once, then clear it.
      const launched = getLastNotificationResponse();
      if (taskIdFromResponse(launched)) {
        clearLastNotificationResponse();
        deliver(launched);
      }
      const sub = addNotificationResponseReceivedListener(deliver);
      return () => sub.remove();
    },
  };
}
