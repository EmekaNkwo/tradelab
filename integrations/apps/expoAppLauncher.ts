import { openApplication } from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import type { AppLauncher, MetaTraderApp } from '../../data/apps/types';
import { fromUnknown } from '../../shared/errors';
import { err, ok } from '../../shared/result';

/** Android package names published by MetaQuotes on Google Play. */
export const METATRADER_PACKAGES: Readonly<Record<MetaTraderApp, string>> = {
  mt4: 'net.metaquotes.metatrader4',
  mt5: 'net.metaquotes.metatrader5',
};

// The message of expo-intent-launcher's PackageNotFoundException, checked against
// expo-intent-launcher ~58.0.3. If an upgrade changes it, the release-build test
// in .maestro/04-mt-task.yaml (branch A, MT5 not installed) shows the regression.
const PACKAGE_NOT_FOUND_MESSAGE = 'Package not found: ';
const MAX_CAUSE_DEPTH = 5;

/**
 * expo-intent-launcher's PackageNotFoundException. In a debug build its code is
 * ERR_PACKAGE_NOT_FOUND. In a minified release build R8 renames (or merges) the
 * class, so the code inferred from its name is something like "ERR_QL1", and the
 * sync-function wrapper prefixes the message ("Call to function ... has been
 * rejected.\n→ Caused by: Package not found: …"). So the message text is matched
 * anywhere, not only at the start.
 */
export function isPackageNotFound(cause: unknown, depth = 0): boolean {
  if (typeof cause !== 'object' || cause === null || depth > MAX_CAUSE_DEPTH) return false;
  const { code, message, cause: inner } = cause as { code?: unknown; message?: unknown; cause?: unknown };
  if (code === 'ERR_PACKAGE_NOT_FOUND') return true;
  if (typeof message === 'string' && message.includes(PACKAGE_NOT_FOUND_MESSAGE)) return true;
  // Some wrappers keep the native error only as a nested cause.
  return isPackageNotFound(inner, depth + 1);
}

export function createAppLauncher(): AppLauncher {
  return {
    async openApp(app) {
      if (Platform.OS !== 'android') return ok('unsupported');
      try {
        // Throws when the package has no launch intent (not installed, or hidden
        // by Android 11+ package visibility; see plugins/withMetaTraderQueries.js).
        openApplication(METATRADER_PACKAGES[app]);
        return ok('opened');
      } catch (cause) {
        if (isPackageNotFound(cause)) return ok('not_installed');
        return err(fromUnknown('ProviderUnavailable', 'Could not open MetaTrader', cause));
      }
    },

    async openStoreListing(app) {
      const id = METATRADER_PACKAGES[app];
      try {
        await Linking.openURL(`market://details?id=${id}`);
        return ok(undefined);
      } catch {
        try {
          await Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`);
          return ok(undefined);
        } catch (cause) {
          return err(fromUnknown('ProviderUnavailable', 'Could not open the Play Store', cause));
        }
      }
    },
  };
}
