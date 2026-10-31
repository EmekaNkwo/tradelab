import type { Migration } from './types';

/** Phase 3: guided MetaTrader task completions, confirmed by the learner (spec §14.3). */
export const migration0003: Migration = {
  version: 3,
  name: 'metatrader_tasks',
  sql: `
CREATE TABLE mt_task_completion (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('mt4','mt5')),
  demo_confirmed_at TEXT,
  answers TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  note TEXT,
  completed_at TEXT NOT NULL
);
CREATE INDEX idx_mt_task_completion_task ON mt_task_completion(task_id, completed_at);
`,
};
