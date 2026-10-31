import type { Migration } from './types';

/**
 * Phase 7: results of the Fundamental Analysis Lab exercises (spec §10.3,
 * §11, §12): penny-stock red-flag cases and market scenarios. `picked` is a
 * JSON array of option ids.
 */
export const migration0009: Migration = {
  version: 9,
  name: 'lab_attempts',
  sql: `
CREATE TABLE lab_attempt (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('red_flag','scenario')),
  ref_id TEXT NOT NULL,
  picked TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  answered_at TEXT NOT NULL
);
CREATE INDEX idx_lab_attempt_ref ON lab_attempt(ref_id, answered_at);
`,
};
