import type { ReminderGateway, ReminderKind, ReminderPlan, ReminderSyncOptions, ReminderSyncOutcome } from '../data/reminders/types';
import { ok } from '../shared/result';

export interface FakeReminders extends ReminderGateway {
  /** Every sync call's plans, oldest first. */
  readonly synced: (readonly ReminderPlan[])[];
  /** Every sync call's options, in the same order. */
  readonly options: ReminderSyncOptions[];
  outcome: ReminderSyncOutcome;
  /** The plan of `kind` in the latest sync, or null when none was scheduled. */
  latest(kind?: ReminderKind): ReminderPlan | null;
}

export function createFakeReminders(): FakeReminders {
  const synced: (readonly ReminderPlan[])[] = [];
  const options: ReminderSyncOptions[] = [];
  const fake: FakeReminders = {
    synced,
    options,
    outcome: 'scheduled',
    async sync(plans, opts) {
      synced.push(plans);
      options.push(opts);
      return ok(plans.every((p) => p.slots.length === 0) ? 'cleared' : fake.outcome);
    },
    latest: (kind = 'class') => synced.at(-1)?.find((p) => p.kind === kind) ?? null,
  };
  return fake;
}
