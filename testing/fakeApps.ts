import type { AppLauncher, MetaTraderApp } from '../data/apps/types';
import { ok } from '../shared/result';

export interface FakeApps extends AppLauncher {
  /** Store listings opened. */
  readonly opened: MetaTraderApp[];
  /** Apps launched. */
  readonly launched: MetaTraderApp[];
  /** Apps that count as installed. */
  installed: MetaTraderApp[];
}

export function createFakeApps(): FakeApps {
  const opened: MetaTraderApp[] = [];
  const launched: MetaTraderApp[] = [];
  return {
    opened,
    launched,
    installed: ['mt5'],
    async openApp(app) {
      if (!this.installed.includes(app)) return ok('not_installed');
      launched.push(app);
      return ok('opened');
    },
    async openStoreListing(app) {
      opened.push(app);
      return ok(undefined);
    },
  };
}
