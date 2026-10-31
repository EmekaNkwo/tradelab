import type { Migration } from './types';

/**
 * Phase 9: Strategy Builder, Backtesting Lab and Playbook (spec §16.2–16.5).
 * - `strategy_version`: the learner's own strategies. Every save is a new
 *   numbered version with its full definition (JSON), so nothing is ever
 *   changed silently and every change stays visible.
 * - `backtest_run`: one row per run, with its inputs, input hash and the
 *   summary result (metrics, curves, warnings, conventions). Trades are not
 *   stored: the same inputs always give the same trades, so they are
 *   recomputed when needed.
 * - `playbook_entry`: the learner's notes on a strategy, linked to a run.
 */
export const migration0011: Migration = {
  version: 11,
  name: 'backtests',
  sql: `
CREATE TABLE strategy_version (
  strategy_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  definition TEXT NOT NULL,
  template_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (strategy_id, version)
);

CREATE TABLE backtest_run (
  id TEXT PRIMARY KEY NOT NULL,
  strategy_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  inputs TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (strategy_id, version) REFERENCES strategy_version (strategy_id, version) ON DELETE CASCADE
);
CREATE INDEX idx_backtest_run_strategy ON backtest_run (strategy_id, created_at);

CREATE TABLE playbook_entry (
  strategy_id TEXT PRIMARY KEY NOT NULL,
  hypothesis TEXT NOT NULL,
  conditions TEXT NOT NULL,
  invalidation TEXT NOT NULL,
  limitations TEXT NOT NULL,
  notes TEXT NOT NULL,
  run_id TEXT REFERENCES backtest_run (id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);
`,
};
