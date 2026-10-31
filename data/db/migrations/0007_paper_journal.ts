import type { Migration } from './types';

/**
 * Phase 5: paper trading accounts, the trading journal, and Psychology Lab
 * answers (spec §17, §21, §22). All three are backed up. A paper account
 * stores its engine state as JSON; its candles are regenerated from the
 * scenario seed, so they are not stored.
 */
export const migration0007: Migration = {
  version: 7,
  name: 'paper_journal',
  sql: `
CREATE TABLE paper_account (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  scenario_kind TEXT NOT NULL,
  seed INTEGER NOT NULL,
  timeframe TEXT NOT NULL,
  starting_balance TEXT NOT NULL,
  state TEXT NOT NULL,
  resets INTEGER NOT NULL DEFAULT 0 CHECK (resets >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE journal_entry (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('replay','paper','manual','mt_import')),
  source_ref TEXT,
  external_id TEXT,
  market TEXT,
  instrument TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy','sell')),
  strategy TEXT,
  entry TEXT NOT NULL,
  stop TEXT,
  target TEXT,
  size TEXT NOT NULL,
  size_unit TEXT NOT NULL,
  exit TEXT,
  pnl_money TEXT,
  pnl_pips TEXT,
  pnl_r TEXT,
  planned_risk TEXT,
  costs TEXT,
  equity_at_entry TEXT,
  opened_at TEXT,
  closed_at TEXT,
  conditions TEXT,
  entry_rationale TEXT,
  exit_rationale TEXT,
  emotion TEXT,
  rule_violations TEXT NOT NULL DEFAULT '[]',
  note_before TEXT,
  note_after TEXT,
  screenshot_uri TEXT,
  review TEXT,
  process_score REAL CHECK (process_score IS NULL OR (process_score >= 0 AND process_score <= 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);
CREATE INDEX idx_journal_entry_closed ON journal_entry(closed_at, created_at);

CREATE TABLE psych_attempt (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_id TEXT NOT NULL,
  response_id TEXT NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('helpful','mixed','harmful')),
  answered_at TEXT NOT NULL
);
CREATE INDEX idx_psych_attempt_scenario ON psych_attempt(scenario_id, answered_at);
`,
};
