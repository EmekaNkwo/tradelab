import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskNotificationGateway, TaskStepNotice } from '../../data';
import type { MetaTraderTask } from '../../domain/models/content';
import { logger } from '../../shared/logger';
import { toUtcIso } from '../../shared/time';
import { useContainer } from '../app';
import { useSettings } from '../settings';

/**
 * The notice for the step the learner is on: the first step not yet ticked. It names only the step number, so
 * it never repeats task wording about trades, prices or signals (spec §11, §29).
 */
export function taskStepNotice(task: Pick<MetaTraderTask, 'id' | 'steps'>, stepsDone: ReadonlySet<number>): TaskStepNotice {
  const total = task.steps.length;
  const current = task.steps.findIndex((_, i) => !stepsDone.has(i));
  const body = current < 0 ? 'All steps ticked. Tap to answer the questions in TradeLab.' : `Step ${current + 1} of ${total}. Tap to go back to the task in TradeLab.`;
  return { taskId: task.id, title: 'MetaTrader task in progress', body };
}

/**
 * Show and clear calls run one after another per gateway, so a fast unmount (clear) can never be overtaken by an
 * earlier show that resolves later and leaves the notice up. Shared across screens for the same reason.
 */
const queues = new WeakMap<TaskNotificationGateway, Promise<unknown>>();
export function serialised<T>(gateway: TaskNotificationGateway, op: () => Promise<T>): Promise<T> {
  const run = (queues.get(gateway) ?? Promise.resolve()).then(op);
  queues.set(
    gateway,
    run.catch(() => undefined),
  );
  return run;
}

export type StepNotificationToggle = 'on' | 'off' | 'permission_denied' | 'failed';

/**
 * Keeps the optional step notification in line with the task run: shown while the setting is on and the task is
 * open, updated when the step changes, cleared when the task is finished or the learner leaves it.
 */
export function useTaskStepNotification(task: Pick<MetaTraderTask, 'id' | 'steps'>, stepsDone: ReadonlySet<number>, finished: boolean) {
  const c = useContainer();
  const settings = useSettings();
  const enabled = settings.status === 'success' && settings.data.mtStepNotification;
  const [denied, setDenied] = useState(false);
  const notice = useMemo(() => taskStepNotice(task, stepsDone), [task, stepsDone]);
  const active = enabled && !finished;

  useEffect(() => {
    if (!active) return undefined;
    const gateway = c.taskNotifications;
    void serialised(gateway, () => gateway.show(notice, { prompt: false })).then(async (r) => {
      if (!r.ok) return logger.warn('Task notification not shown', { kind: r.error.kind });
      if (r.value !== 'permission_denied') return undefined;
      // Permission was taken away in system settings: turn the setting off and say why.
      setDenied(true);
      const off = await c.settings.update({ mtStepNotification: false }, toUtcIso(c.clock.now()));
      if (!off.ok) logger.warn('Step notification setting not turned off', { kind: off.error.kind });
      return undefined;
    });
    return undefined;
  }, [active, notice, c]);

  // Clear when the run stops being active (finished, turned off) and when the screen goes away.
  useEffect(() => {
    if (!active) return undefined;
    const gateway = c.taskNotifications;
    return () => {
      void serialised(gateway, () => gateway.clear()).then((r) => {
        if (!r.ok) logger.warn('Task notification not cleared', { kind: r.error.kind });
      });
    };
  }, [active, c.taskNotifications]);

  const toggle = useCallback(
    async (on: boolean): Promise<StepNotificationToggle> => {
      setDenied(false);
      const now = () => toUtcIso(c.clock.now());
      if (on) {
        // Permission is asked for only here, when the learner turns it on.
        const gateway = c.taskNotifications;
        const shown = await serialised(gateway, () => gateway.show(notice, { prompt: true }));
        if (!shown.ok) return 'failed';
        if (shown.value === 'permission_denied') {
          setDenied(true);
          return 'permission_denied';
        }
      }
      const saved = await c.settings.update({ mtStepNotification: on }, now());
      if (!saved.ok) {
        if (on) await serialised(c.taskNotifications, () => c.taskNotifications.clear());
        return 'failed';
      }
      return on ? 'on' : 'off';
    },
    [c, notice],
  );

  return { enabled, denied, toggle };
}
