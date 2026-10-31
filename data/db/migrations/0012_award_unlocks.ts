import type { Migration } from './types';

/**
 * Phase 10: latched awards (spec §29). The first time a challenge, badge or
 * milestone is met it is stored with its date, so it stays earned (with its
 * XP) even when later records would no longer meet it. Rows are only ever
 * inserted, never changed.
 *
 * `review_queue.early_from`: set when an item is brought forward for targeted
 * practice, holding the date it was really scheduled for, so a brought-forward
 * review cannot promote it faster than its schedule (spec §23).
 */
export const migration0012: Migration = {
  version: 12,
  name: 'award_unlocks',
  sql: `
CREATE TABLE award_unlock (
  kind TEXT NOT NULL CHECK (kind IN ('challenge','badge','milestone')),
  award_id TEXT NOT NULL CHECK (length(award_id) BETWEEN 1 AND 100),
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (kind, award_id)
);

ALTER TABLE review_queue ADD COLUMN early_from TEXT;
`,
};
