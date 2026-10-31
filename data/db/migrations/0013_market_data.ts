import type { Migration } from './types';

/**
 * Phase 11: real price data (spec §30).
 *
 * `imported_dataset`: candles from the learner's own CSV file, with the
 * instrument details they gave and the data-quality report. Learner data, so
 * it is backed up.
 *
 * `provider_dataset`: candles fetched from an optional provider with the
 * learner's own key, cached by request so repeat views do not spend the
 * provider's rate limit. A cache, not learner data: it is not backed up
 * (provider terms apply to the learner's own use, see data/DATA_SOURCES.md)
 * and can be fetched again.
 *
 * Neither table ever holds an API key.
 */
const DATASET_COLUMNS = `
  id TEXT PRIMARY KEY NOT NULL,
  source_name TEXT NOT NULL CHECK (length(source_name) BETWEEN 1 AND 80),
  symbol TEXT NOT NULL CHECK (length(symbol) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  market TEXT NOT NULL CHECK (market IN ('forex','stocks','penny_stocks','commodities','futures')),
  venue TEXT CHECK (venue IS NULL OR length(venue) <= 80),
  currency TEXT NOT NULL CHECK (length(currency) BETWEEN 1 AND 10),
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 64),
  timeframe TEXT NOT NULL CHECK (timeframe IN ('M1','M5','M15','M30','H1','H4','D1','W1')),
  contract_instrument_id TEXT NOT NULL,
  candle_count INTEGER NOT NULL CHECK (candle_count > 0),
  first_time TEXT NOT NULL,
  last_time TEXT NOT NULL,
  candles TEXT NOT NULL,
  quality TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL`;

export const migration0013: Migration = {
  version: 13,
  name: 'market_data',
  sql: `
CREATE TABLE imported_dataset (${DATASET_COLUMNS},
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200)
);
CREATE INDEX idx_imported_dataset_created ON imported_dataset(created_at);

CREATE TABLE provider_dataset (${DATASET_COLUMNS},
  request_key TEXT NOT NULL UNIQUE
);
`,
};
