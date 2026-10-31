import { setNotificationHandler } from 'expo-notifications';

let installed = false;

/**
 * How notifications show while TradeLab is in the foreground. Installed once, by whichever gateway shows
 * something first (learning reminders or the MetaTrader step notice), so neither depends on the other.
 */
export function installNotificationHandler(): void {
  if (installed) return;
  installed = true;
  setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Test-only: forget that the handler was installed. */
export function resetNotificationHandlerForTests(): void {
  installed = false;
}
