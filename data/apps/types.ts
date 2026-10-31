import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';

export type MetaTraderApp = 'mt4' | 'mt5';

/** `unsupported`: this platform cannot launch other apps by package (only Android can). */
export type LaunchResult = 'opened' | 'not_installed' | 'unsupported';

/** Opens other apps and store listings (spec §14.2). Implemented in integrations/. */
export interface AppLauncher {
  /** Opens the Play Store listing for MetaTrader; falls back to the web listing. */
  openStoreListing(app: MetaTraderApp): Promise<Result<void, AppError>>;
  /**
   * "Do it in MetaTrader" (spec §14.2): launches the installed app by package
   * name. Resolves `not_installed` so the caller can offer the store listing.
   */
  openApp(app: MetaTraderApp): Promise<Result<LaunchResult, AppError>>;
}
