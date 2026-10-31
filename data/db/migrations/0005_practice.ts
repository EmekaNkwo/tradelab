import type { Migration } from './types';

/** Phase 4: chart drill answers and finished replays (spec §13.2, §13.4). Both are backed up. */
export const migration0005: Migration = {
  version: 5,
  name: 'practice',
  sql: `
CREATE TABLE drill_attempt (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  seed INTEGER NOT NULL,
  option_id TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0,1)),
  answered_at TEXT NOT NULL
);
CREATE INDEX idx_drill_attempt_kind ON drill_attempt(kind, answered_at);

CREATE TABLE replay_attempt (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_kind TEXT NOT NULL,
  seed INTEGER NOT NULL,
  timeframe TEXT NOT NULL,
  starting_balance TEXT NOT NULL,
  final_balance TEXT NOT NULL,
  trades TEXT NOT NULL,
  process_score REAL CHECK (process_score IS NULL OR (process_score >= 0 AND process_score <= 1)),
  note TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);
CREATE INDEX idx_replay_attempt_finished ON replay_attempt(finished_at);
`,
};
