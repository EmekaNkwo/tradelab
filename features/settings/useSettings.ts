import { useCallback } from 'react';
import type { AppSettings } from '../../domain/models/learner';
import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery } from '../app';
import { USER_ACTION, resyncReminders } from '../learning';

export function useSettings() {
  const { settings } = useContainer();
  return useLiveQuery(() => settings.get(), ['settings']);
}


export function useUpdateSettings(): (patch: Partial<AppSettings>) => Promise<Result<AppSettings, AppError>> {
  const c = useContainer();
  return useCallback(
    async (patch) => {
      const updated = await c.settings.update(patch, toUtcIso(c.clock.now()));
      // Changing a learning reminder (spec §29) reschedules them; turning one on may show the permission prompt.
      if (updated.ok && 'reminders' in patch) await resyncReminders(c, USER_ACTION);
      return updated;
    },
    [c],
  );
}
