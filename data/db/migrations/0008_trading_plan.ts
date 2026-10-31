import type { Migration } from './types';

/**
 * Phase 6: the learner's trading plan (spec §20). Every save is a new
 * version; earlier versions are kept so the learner can see how the plan
 * changed. The plan itself is validated JSON.
 */
export const migration0008: Migration = {
  version: 8,
  name: 'trading_plan',
  sql: `
CREATE TABLE trading_plan (
  version INTEGER PRIMARY KEY NOT NULL CHECK (version >= 1),
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`,
};
