import { z } from 'zod';
import type { DataQualityReport } from '../../domain/marketData/csvImport';
import type { DatasetSummary, StoredDataset, StoredDatasetOrigin } from '../../domain/models/marketData';
import type { Candle, Timeframe } from '../../domain/models/markets';
import { dec, isDecimalString } from '../../shared/decimal';
import { dataQualityError, fromUnknown, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { sha256 } from '../../shared/sha256';
import { isUtcIso, type UtcIso } from '../../shared/time';
import { MARKET_KINDS, type MarketKind } from '../../shared/types';
import type { ChangeBus } from '../db/changeBus';
import type { SqlDatabase } from '../db/client';

/**
 * Real price data on the phone (spec §30): learner imports (backed up) and a
 * cache of provider data (not backed up). Rows are re-validated on every
 * read, so a damaged row is refused rather than charted.
 */

export type NewDataset = Omit<StoredDataset, 'id' | 'contentHash' | 'createdAt' | 'candleCount' | 'first' | 'last'>;

export interface CachedProviderDataset {
  readonly summary: DatasetSummary;
  readonly fetchedAt: UtcIso;
}

export interface MarketDataRepository {
  list(): Promise<Result<readonly DatasetSummary[], AppError>>;
  get(id: string): Promise<Result<StoredDataset | null, AppError>>;
  saveImport(input: NewDataset, now: UtcIso): Promise<Result<DatasetSummary, AppError>>;
  /** Stores (or replaces) provider data for one request, e.g. "twelvedata|EUR/USD|1h|5000". */
  saveProviderData(requestKey: string, input: NewDataset, now: UtcIso): Promise<Result<DatasetSummary, AppError>>;
  findProviderData(requestKey: string): Promise<Result<CachedProviderDataset | null, AppError>>;
  delete(id: string): Promise<Result<void, AppError>>;
}

export const MAX_DATASET_CANDLES = 30000;
export const IMPORT_ID_PREFIX = 'imp';
export const PROVIDER_ID_PREFIX = 'prv';

type Tuple = [string, string, string, string, string, string | null];

export function encodeCandles(candles: readonly Candle[]): string {
  return JSON.stringify(candles.map((c): Tuple => [c.time, c.open.toString(), c.high.toString(), c.low.toString(), c.close.toString(), c.volume ? c.volume.toString() : null]));
}

const decimalText = z.string().refine(isDecimalString);
const tupleSchema = z.tuple([z.string().refine(isUtcIso), decimalText, decimalText, decimalText, decimalText, decimalText.nullable()]);

export function decodeCandles(text: string): Candle[] | null {
  try {
    const parsed = z.array(tupleSchema).max(MAX_DATASET_CANDLES).safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    return parsed.data.map(([time, o, h, l, c, v]) => ({ time: time as UtcIso, open: dec(o), high: dec(h), low: dec(l), close: dec(c), volume: v === null ? null : dec(v) }));
  } catch {
    return null;
  }
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as const;

export const qualitySchema = z
  .object({
    status: z.enum(['ok', 'warnings', 'refused']),
    rows: z.number().int().min(0),
    candles: z.number().int().min(0),
    timeframe: z.enum(TIMEFRAMES).nullable(),
    first: z.string().nullable(),
    last: z.string().nullable(),
    hasVolume: z.boolean(),
    errors: z.array(z.string().max(300)).max(30),
    warnings: z.array(z.string().max(300)).max(30),
  })
  .strict() as unknown as z.ZodType<DataQualityReport>;

export function parseQuality(text: unknown): DataQualityReport | null {
  if (typeof text !== 'string') return null;
  try {
    const r = qualitySchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const newDatasetSchema = z.object({
  origin: z.enum(['user_import', 'historical']),
  sourceName: z.string().trim().min(1).max(80),
  fileName: z.string().trim().min(1).max(200).nullable(),
  symbol: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  market: z.enum(MARKET_KINDS as unknown as [MarketKind, ...MarketKind[]]),
  venue: z.string().trim().max(80).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  timeZone: z.string().trim().min(1).max(64),
  timeframe: z.enum(TIMEFRAMES),
  contractInstrumentId: z.string().min(1).max(40),
});

interface Row {
  readonly id: string;
  readonly source_name: string;
  readonly file_name?: string;
  readonly symbol: string;
  readonly name: string;
  readonly market: MarketKind;
  readonly venue: string | null;
  readonly currency: string | null;
  readonly time_zone: string;
  readonly timeframe: Timeframe;
  readonly contract_instrument_id: string;
  readonly candle_count: number;
  readonly first_time: string;
  readonly last_time: string;
  readonly candles?: string;
  readonly quality: string;
  readonly content_hash: string;
  readonly created_at: string;
}

const SUMMARY_COLUMNS = 'id, source_name, symbol, name, market, venue, currency, time_zone, timeframe, contract_instrument_id, candle_count, first_time, last_time, quality, content_hash, created_at';

function toSummary(row: Row, origin: StoredDatasetOrigin): DatasetSummary | null {
  const quality = parseQuality(row.quality);
  if (!quality || !isUtcIso(row.first_time) || !isUtcIso(row.last_time)) return null;
  return {
    id: row.id,
    origin,
    sourceName: row.source_name,
    fileName: origin === 'user_import' ? (row.file_name ?? null) : null,
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    venue: row.venue,
    currency: row.currency,
    timeZone: row.time_zone,
    timeframe: row.timeframe,
    contractInstrumentId: row.contract_instrument_id,
    candleCount: row.candle_count,
    first: row.first_time as UtcIso,
    last: row.last_time as UtcIso,
    quality,
    contentHash: row.content_hash,
    createdAt: row.created_at as UtcIso,
  };
}

function validateNew(input: NewDataset): Result<NewDataset, AppError> {
  const parsed = newDatasetSchema.safeParse(input);
  if (!parsed.success) return err(validationError('Check the data set details', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }));
  if (input.candles.length === 0 || input.candles.length > MAX_DATASET_CANDLES) return err(validationError(`A data set needs between 1 and ${MAX_DATASET_CANDLES} candles`));
  if (input.quality.status === 'refused') return err(dataQualityError('Data that failed its checks cannot be saved'));
  return ok(input);
}

export function createMarketDataRepository(db: SqlDatabase, bus: ChangeBus, newId: (prefix: string) => string): MarketDataRepository {
  // Rows are never edited, so a hash checked once this session need not be checked again. Any write
  // to the tables (a restore included) clears the cache, so restored rows are always verified.
  let verified: ReadonlySet<string> = new Set();
  bus.subscribe(['imported_dataset', 'provider_dataset'], () => {
    verified = new Set();
  });
  const verifiedKey = (row: Row) => `${row.id}:${row.content_hash}:${row.created_at}`;
  const insert = async (table: 'imported_dataset' | 'provider_dataset', input: NewDataset, now: UtcIso, extra: { column: string; value: string }): Promise<Result<DatasetSummary, AppError>> => {
    const valid = validateNew(input);
    if (!valid.ok) return valid;
    const candles = encodeCandles(input.candles);
    const first = input.candles[0] as Candle;
    const last = input.candles[input.candles.length - 1] as Candle;
    const id = newId(table === 'imported_dataset' ? IMPORT_ID_PREFIX : PROVIDER_ID_PREFIX);
    const hash = sha256(candles);
    try {
      await db.transactionAsync(async (tx) => {
        await tx.runAsync(
          `INSERT INTO ${table} (id, source_name, symbol, name, market, venue, currency, time_zone, timeframe, contract_instrument_id, candle_count, first_time, last_time, candles, quality, content_hash, created_at, ${extra.column}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.sourceName.trim(), input.symbol.trim(), input.name.trim(), input.market, input.venue, input.currency, input.timeZone.trim(), input.timeframe, input.contractInstrumentId, input.candles.length, first.time, last.time, candles, JSON.stringify(input.quality), hash, now, extra.value],
        );
        // Provider data is versioned: older copies for the same request are kept while a backtest run used them.
        if (table === 'provider_dataset') {
          await tx.runAsync(
            `DELETE FROM provider_dataset WHERE request_key = ? AND id <> ? AND id NOT IN (SELECT json_extract(inputs, '$.dataset.datasetId') FROM backtest_run WHERE json_extract(inputs, '$.dataset.datasetId') IS NOT NULL)`,
            [extra.value, id],
          );
        }
      });
    } catch (cause) {
      return err(fromUnknown('StorageError', 'Saving the data set failed', cause));
    }
    bus.emit([table]);
    const { candles: _omit, ...rest } = input;
    void _omit;
    return ok({ ...rest, id, candleCount: input.candles.length, first: first.time, last: last.time, contentHash: hash, createdAt: now });
  };

  return {
    async list() {
      try {
        const imported = await db.getAllAsync<Row>(`SELECT ${SUMMARY_COLUMNS}, file_name FROM imported_dataset ORDER BY created_at DESC`, []);
        const fetched = await db.getAllAsync<Row>(`SELECT ${SUMMARY_COLUMNS} FROM provider_dataset ORDER BY created_at DESC`, []);
        const all = [...imported.map((r) => toSummary(r, 'user_import')), ...fetched.map((r) => toSummary(r, 'historical'))];
        return ok(all.filter((s): s is DatasetSummary => s !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading data sets failed', cause));
      }
    },

    async get(id) {
      const table = id.startsWith(`${IMPORT_ID_PREFIX}_`) ? 'imported_dataset' : id.startsWith(`${PROVIDER_ID_PREFIX}_`) ? 'provider_dataset' : null;
      if (!table) return ok(null);
      try {
        const row = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        if (!row) return ok(null);
        const summary = toSummary(row, table === 'imported_dataset' ? 'user_import' : 'historical');
        const candles = typeof row.candles === 'string' ? decodeCandles(row.candles) : null;
        if (!summary || !candles || candles.length !== row.candle_count) return err(dataQualityError('This stored data set is damaged'));
        const key = verifiedKey(row);
        if (!verified.has(key)) {
          if (sha256(row.candles as string) !== row.content_hash) return err(dataQualityError('This stored data set has changed since it was saved'));
          verified = new Set([...verified, key]);
        }
        return ok({ ...summary, candles });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the data set failed', cause));
      }
    },

    saveImport: (input, now) => insert('imported_dataset', { ...input, origin: 'user_import' }, now, { column: 'file_name', value: input.fileName ?? 'your file' }),

    saveProviderData: (requestKey, input, now) => insert('provider_dataset', { ...input, origin: 'historical', fileName: null }, now, { column: 'request_key', value: requestKey }),

    async findProviderData(requestKey) {
      try {
        const row = await db.getFirstAsync<Row>(`SELECT ${SUMMARY_COLUMNS} FROM provider_dataset WHERE request_key = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, [requestKey]);
        if (!row) return ok(null);
        const summary = toSummary(row, 'historical');
        return ok(summary ? { summary, fetchedAt: summary.createdAt } : null);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading cached data failed', cause));
      }
    },

    async delete(id) {
      try {
        await db.runAsync('DELETE FROM imported_dataset WHERE id = ?', [id]);
        await db.runAsync('DELETE FROM provider_dataset WHERE id = ?', [id]);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Deleting the data set failed', cause));
      }
      bus.emit(['imported_dataset', 'provider_dataset']);
      return ok(undefined);
    },
  };
}
