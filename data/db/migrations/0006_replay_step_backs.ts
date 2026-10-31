import type { Migration } from './types';

/**
 * Phase 4 review (LOW): record how many times the learner stepped back in a
 * replay, so the review can say the result was reached with a second look.
 * Older backups restore with 0.
 */
export const migration0006: Migration = {
  version: 6,
  name: 'replay_step_backs',
  sql: `
ALTER TABLE replay_attempt ADD COLUMN step_backs INTEGER NOT NULL DEFAULT 0 CHECK (step_backs >= 0);
`,
};
