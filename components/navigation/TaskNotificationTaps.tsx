import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect, useState } from 'react';
import { useContainer } from '../../features/app';
import { logger } from '../../shared/logger';
import { canOpen } from '../../shared/routeAccess';

/**
 * Tapping the MetaTrader step notification brings the learner back to that task (spec §11). Renders nothing.
 *
 * On a cold start the tap arrives before the navigator exists, so it is held until the root navigator is ready
 * and the start redirect (`/` → `/home`) has run; pushing earlier would be lost or overwritten. A learner who has
 * not finished setting up is left where the app sends them.
 */
export function TaskNotificationTaps() {
  const { taskNotifications, profile } = useContainer();
  const navigatorKey = useRootNavigationState()?.key;
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(
    () =>
      taskNotifications.onOpen((id) => {
        setPending(id);
        // The task screen shows it again if the setting is on; a tapped notice must not linger.
        void taskNotifications.clear().then((r) => {
          if (!r.ok) logger.warn('Tapped task notification not cleared', { kind: r.error.kind });
        });
      }),
    [taskNotifications],
  );

  useEffect(() => {
    if (!pending || !navigatorKey || pathname === '/') return undefined;
    let cancelled = false;
    void profile.get().then((p) => {
      if (cancelled) return;
      setPending(null);
      if (!p.ok || !p.value || !canOpen('/mt-task/[id]')) return;
      router.push({ pathname: '/mt-task/[id]', params: { id: pending } });
    });
    return () => {
      cancelled = true;
    };
  }, [pending, navigatorKey, pathname, profile]);

  return null;
}
