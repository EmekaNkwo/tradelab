import type { TaskNotificationGateway, TaskNoticeOutcome, TaskStepNotice } from '../data/reminders/taskNotification';
import { ok } from '../shared/result';

/** Test-only stand-in for the ongoing MetaTrader task notification. */
export interface FakeTaskNotifications extends TaskNotificationGateway {
  /** The notice on screen now, or null. */
  readonly current: TaskStepNotice | null;
  /** Every show call, oldest first, with whether it could prompt for permission. */
  readonly shown: { readonly notice: TaskStepNotice; readonly prompt: boolean }[];
  clears: number;
  /** What the next show returns while permission is not granted. */
  permission: 'granted' | 'denied' | 'ask';
  /** Simulates the learner tapping the notice. */
  tap(taskId: string): void;
}

export function createFakeTaskNotifications(): FakeTaskNotifications {
  const listeners = new Set<(taskId: string) => void>();
  let current: TaskStepNotice | null = null;
  const fake: FakeTaskNotifications = {
    get current() {
      return current;
    },
    shown: [],
    clears: 0,
    permission: 'ask',
    async show(notice, options) {
      fake.shown.push({ notice, prompt: options.prompt });
      const granted = fake.permission === 'granted' || (fake.permission === 'ask' && options.prompt);
      if (!granted) return ok<TaskNoticeOutcome>('permission_denied');
      fake.permission = 'granted';
      current = notice;
      return ok<TaskNoticeOutcome>('shown');
    },
    async clear() {
      fake.clears += 1;
      current = null;
      return ok(undefined);
    },
    async hasPermission() {
      return fake.permission === 'granted';
    },
    onOpen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tap(taskId) {
      for (const l of listeners) l(taskId);
    },
  };
  return fake;
}
