import type { Migration } from './types';

/**
 * Phase 1 schema: system tables and learner settings/profile.
 * Later phases add their own tables in new migrations; applied migrations are
 * never edited (the runner verifies checksums).
 */
export const migration0001: Migration = {
  version: 1,
  name: 'init',
  sql: `
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE user_profile (
  id TEXT PRIMARY KEY NOT NULL,
  experience TEXT NOT NULL,
  markets TEXT NOT NULL,
  goals TEXT NOT NULL,
  explanation_level TEXT NOT NULL CHECK (explanation_level IN ('simple','balanced','advanced')),
  metatrader TEXT,
  time_zone TEXT NOT NULL,
  risk_acknowledged_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE content_version (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  installed_at TEXT NOT NULL
);

CREATE TABLE job (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  payload TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_job_status ON job(status);
`,
};
