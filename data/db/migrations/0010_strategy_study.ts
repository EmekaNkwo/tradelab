import type { Migration } from './types';

/**
 * Phase 8: the Strategy Library (spec §15.3, §16.1).
 * - `strategy_saved`: bookmarks and the personal study list. `position`
 *   orders the study list; bookmarks keep the order they were added in.
 * - `lab_attempt` gains two kinds for strategy pages: the guided exercise
 *   and the knowledge check. SQLite cannot change a CHECK constraint, so the
 *   table is rebuilt with every existing row copied across.
 */
export const migration0010: Migration = {
  version: 10,
  name: 'strategy_study',
  sql: `
CREATE TABLE strategy_saved (
  strategy_id TEXT NOT NULL,
  list TEXT NOT NULL CHECK (list IN ('bookmark','study')),
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TEXT NOT NULL,
  PRIMARY KEY (strategy_id, list)
);

CREATE TABLE lab_attempt_v10 (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('red_flag','scenario','strategy_exercise','strategy_check')),
  ref_id TEXT NOT NULL,
  picked TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  answered_at TEXT NOT NULL
);
INSERT INTO lab_attempt_v10 (id, kind, ref_id, picked, score, answered_at)
  SELECT id, kind, ref_id, picked, score, answered_at FROM lab_attempt;
DROP INDEX idx_lab_attempt_ref;
DROP TABLE lab_attempt;
ALTER TABLE lab_attempt_v10 RENAME TO lab_attempt;
CREATE INDEX idx_lab_attempt_ref ON lab_attempt(ref_id, answered_at);
`,
};
