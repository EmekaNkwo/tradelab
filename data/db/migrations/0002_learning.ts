import type { Migration } from './types';

/**
 * Phase 2: enrolment, schedule, daily classes, lesson/quiz progress,
 * spaced-repetition queue, and missions. Class units are derived from content
 * and not stored; classes store the unit ids they cover.
 */
export const migration0002: Migration = {
  version: 2,
  name: 'learning',
  sql: `
CREATE TABLE program_enrolment (
  id TEXT PRIMARY KEY NOT NULL,
  program_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','queued','paused','completed')),
  queue_position INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL,
  class_time TEXT,
  reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_enrolment_one_active ON program_enrolment(status) WHERE status = 'active';

CREATE TABLE daily_class (
  id TEXT PRIMARY KEY NOT NULL,
  enrolment_id TEXT NOT NULL REFERENCES program_enrolment(id) ON DELETE CASCADE,
  class_index INTEGER NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lesson','review','checkpoint')),
  module_id TEXT,
  unit_ids TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','in_progress','completed','skipped')),
  sections_done INTEGER NOT NULL DEFAULT 0,
  score REAL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_daily_class_enrolment_date ON daily_class(enrolment_id, date);

CREATE TABLE class_note (
  id TEXT PRIMARY KEY NOT NULL,
  class_id TEXT NOT NULL REFERENCES daily_class(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE unit_completion (
  enrolment_id TEXT NOT NULL REFERENCES program_enrolment(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (enrolment_id, unit_id)
);

CREATE TABLE lesson_progress (
  lesson_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','completed')),
  best_score REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE quiz_attempt (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lesson_check','checkpoint','review','placement')),
  ref_id TEXT NOT NULL,
  answers TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  passed INTEGER NOT NULL CHECK (passed IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_quiz_attempt_ref ON quiz_attempt(ref_id);

CREATE TABLE review_queue (
  concept_id TEXT PRIMARY KEY NOT NULL,
  box INTEGER NOT NULL CHECK (box >= 1),
  due_date TEXT NOT NULL,
  lapses INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE mission (
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  target INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  focus TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (date, kind)
);
`,
};
