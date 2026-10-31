import {
  AndroidImportance,
  cancelAllScheduledNotificationsAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
  setNotificationChannelAsync,
} from 'expo-notifications';
import { Platform } from 'react-native';
import type { ReminderGateway, ReminderPlan, ReminderSyncOptions, ReminderSyncOutcome } from '../../data/reminders/types';
import type { AppError } from '../../shared/errors';
import { fromUnknown } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { installNotificationHandler } from './notificationHandler';

const CHANNEL_ID = 'class-reminders';

async function ensurePermission(prompt: boolean): Promise<boolean> {
  // Android 13+ shows the permission prompt only once a channel exists.
  await setNotificationChannelAsync(CHANNEL_ID, {
    // The id stays "class-reminders" so existing installs keep their channel settings.
    name: 'Learning reminders',
    importance: AndroidImportance.DEFAULT,
  });
  const current = await getPermissionsAsync();
  if (current.granted) return true;
  if (!prompt || !current.canAskAgain) return false;
  return (await requestPermissionsAsync()).granted;
}

async function schedule(plan: ReminderPlan) {
  for (const slot of plan.slots) {
    await scheduleNotificationAsync({
      content: { title: plan.title, body: plan.body },
      trigger: {
        type: SchedulableTriggerInputTypes.WEEKLY,
        channelId: CHANNEL_ID,
        // expo-notifications numbers weekdays 1 (Sunday) … 7 (Saturday).
        weekday: slot.weekday + 1,
        hour: slot.hour,
        minute: slot.minute,
      },
    });
  }
}

async function syncNow(plans: readonly ReminderPlan[], options: ReminderSyncOptions): Promise<Result<ReminderSyncOutcome, AppError>> {
  try {
    installNotificationHandler();
    await cancelAllScheduledNotificationsAsync();
    if (plans.every((p) => p.slots.length === 0)) return ok('cleared');
    if (!(await ensurePermission(options.prompt))) return ok('permission_denied');
    for (const plan of plans) await schedule(plan);
    return ok('scheduled');
  } catch (cause) {
    // Never leave half a set of reminders behind.
    await cancelAllScheduledNotificationsAsync().catch(() => undefined);
    return err(fromUnknown('ProviderUnavailable', 'Scheduling reminders failed', cause));
  }
}

export function createExpoReminderGateway(platform: string = Platform.OS): ReminderGateway {
  // Syncs run one after another, so two quick changes can never interleave cancel and schedule calls.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    sync(plans, options) {
      // Local scheduled notifications are not supported on web.
      if (platform === 'web') return Promise.resolve(ok('cleared'));
      const run = queue.then(() => syncNow(plans, options));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
