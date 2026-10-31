import type { Migration } from './types';

/**
 * Phase 3 review fix: an unfinished guided MetaTrader task is saved as the
 * learner goes, because Android may close TradeLab while they are in
 * MetaTrader. Drafts are temporary and are not included in backups.
 */
export const migration0004: Migration = {
  version: 4,
  name: 'mt_task_draft',
  sql: `
CREATE TABLE mt_task_draft (
  task_id TEXT PRIMARY KEY NOT NULL,
  draft TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
