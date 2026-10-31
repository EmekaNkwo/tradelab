import type { Migration } from './types';

/**
 * Phase 11 review: fetched provider data becomes immutable versions. A
 * refetch adds a new row instead of replacing the old one, so a backtest that
 * used the older candles keeps them. The cache lookup takes the newest row for
 * a request key. The table is a cache (never backed up), so it is rebuilt
 * empty rather than copied.
 */
export const migration0014: Migration = {
  version: 14,
  name: 'provider_dataset_versions',
  sql: `
DROP TABLE provider_dataset;
CREATE TABLE provider_dataset (
  id TEXT PRIMARY KEY NOT NULL,
  source_name TEXT NOT NULL CHECK (length(source_name) BETWEEN 1 AND 80),
  symbol TEXT NOT NULL CHECK (length(symbol) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  market TEXT NOT NULL CHECK (market IN ('forex','stocks','penny_stocks','commodities','futures')),
  venue TEXT CHECK (venue IS NULL OR length(venue) <= 80),
  currency TEXT CHECK (currency IS NULL OR (length(currency) = 3 AND currency = upper(currency))),
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 64),
  timeframe TEXT NOT NULL CHECK (timeframe IN ('M1','M5','M15','M30','H1','H4','D1','W1')),
  contract_instrument_id TEXT NOT NULL,
  candle_count INTEGER NOT NULL CHECK (candle_count > 0),
  first_time TEXT NOT NULL,
  last_time TEXT NOT NULL,
  candles TEXT NOT NULL,
  quality TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL
);
CREATE INDEX idx_provider_dataset_request ON provider_dataset(request_key, created_at);
`,
};
