import { dec, isTypedNumber } from '../../shared/decimal';
import type { UtcIso } from '../../shared/time';
import { TIMEFRAME_MINUTES } from '../market/scenarios';
import type { Candle, Timeframe } from '../models/markets';

/**
 * Strict OHLCV CSV import (spec §30). The learner's own file is checked line
 * by line; anything that would make a chart or a backtest misleading
 * refuses the import with the line numbers, and smaller issues are listed as
 * warnings. Nothing is ever guessed silently: every assumption made (time
 * zone, order, timeframe) is reported.
 */

export const CSV_LIMITS = { minCandles: 50, maxCandles: 30000, maxBytes: 5 * 1024 * 1024, maxIssuesShown: 20 } as const;

export type QualityStatus = 'ok' | 'warnings' | 'refused';

export interface DataQualityReport {
  readonly status: QualityStatus;
  readonly rows: number;
  readonly candles: number;
  readonly timeframe: Timeframe | null;
  readonly first: UtcIso | null;
  readonly last: UtcIso | null;
  readonly hasVolume: boolean;
  /** Problems that refuse the import, with line numbers (at most `maxIssuesShown`, then a count). */
  readonly errors: readonly string[];
  /** Assumptions and smaller problems, shown with the data wherever it is used. */
  readonly warnings: readonly string[];
}

export interface CsvImportResult {
  readonly candles: readonly Candle[];
  readonly report: DataQualityReport;
}

const HEADER_NAMES = {
  time: ['datetime', 'timestamp', 'date_time', 'date/time', 'gmt time', 'local time', 'date', 'time'],
  open: ['open', 'o'],
  high: ['high', 'h'],
  low: ['low', 'l'],
  close: ['close', 'c', 'adj close', 'last', 'price'],
  volume: ['volume', 'vol', 'v', 'tick volume', 'tickvol'],
} as const;

type Column = keyof typeof HEADER_NAMES;

/** Timeframes a file can be read as, shortest first. */
const TIMEFRAMES: readonly Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function detectDelimiter(header: string): string {
  const best = [',', ';', '\t'].map((d) => ({ d, n: header.split(d).length - 1 })).sort((a, b) => b.n - a.n)[0];
  return best && best.n > 0 ? best.d : ',';
}

function mapColumns(cells: readonly string[]): Partial<Record<Column, number>> {
  const lower = cells.map((c) => c.replace(/^﻿/, '').replace(/[<>]/g, '').trim().toLowerCase());
  const map: Partial<Record<Column, number>> = {};
  (Object.keys(HEADER_NAMES) as Column[]).forEach((col) => {
    const index = lower.findIndex((h) => (HEADER_NAMES[col] as readonly string[]).includes(h));
    if (index >= 0) map[col] = index;
  });
  return map;
}

const ISO_ZONED = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;
const NAIVE_DATETIME = /^(\d{4})[-./](\d{2})[-./](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_ONLY = /^(\d{4})[-./](\d{2})[-./](\d{2})$/;
const EPOCH = /^\d{10}(\d{3})?$/;

interface ParsedTime {
  readonly ms: number;
  readonly zoned: boolean;
}

/** Reads one timestamp. Times without a zone are read as UTC, and the report says so. */
export function parseTimestamp(text: string): ParsedTime | null {
  const t = text.trim();
  if (EPOCH.test(t)) return { ms: t.length === 10 ? Number(t) * 1000 : Number(t), zoned: true };
  if (ISO_ZONED.test(t)) {
    const ms = Date.parse(t.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return Number.isNaN(ms) ? null : { ms, zoned: true };
  }
  const naive = NAIVE_DATETIME.exec(t) ?? DATE_ONLY.exec(t);
  if (!naive) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = naive;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // Reject dates that roll over (e.g. 2024-02-31).
  const back = new Date(ms);
  if (Number.isNaN(ms) || back.getUTCMonth() !== Number(mo) - 1 || back.getUTCDate() !== Number(d) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  return { ms, zoned: false };
}

/** The timeframe that the most common spacing between candles matches, or null when none fits. */
export function detectTimeframe(times: readonly number[]): Timeframe | null {
  const counts = new Map<number, number>();
  for (let i = 1; i < times.length; i += 1) {
    const diff = (times[i] as number) - (times[i - 1] as number);
    if (diff > 0) counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  if (common === undefined) return null;
  return TIMEFRAMES.find((tf) => TIMEFRAME_MINUTES[tf] * 60_000 === common) ?? null;
}

function cap(issues: readonly string[]): readonly string[] {
  if (issues.length <= CSV_LIMITS.maxIssuesShown) return issues;
  return [...issues.slice(0, CSV_LIMITS.maxIssuesShown), `…and ${issues.length - CSV_LIMITS.maxIssuesShown} more`];
}

function refused(rows: number, errors: readonly string[], warnings: readonly string[] = []): CsvImportResult {
  return { candles: [], report: { status: 'refused', rows, candles: 0, timeframe: null, first: null, last: null, hasVolume: false, errors: cap(errors), warnings } };
}

interface Row {
  readonly line: number;
  readonly ms: number;
  readonly candle: Omit<Candle, 'time'>;
}

/** One row of price data as text, from a CSV line or a provider response. */
export interface RawRow {
  /** Line in the file (or position in the response), for messages. */
  readonly line: number;
  readonly time: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  /** Undefined when the source has no volume column; empty when this row has none. */
  readonly volume?: string;
}

/** Longest price the app keeps exactly; longer ones are refused rather than silently rounded. */
export const MAX_PRICE_DIGITS = 18;

const significantDigits = (t: string) => t.replace(/^[-+]/, '').replace('.', '').replace(/^0+/, '').length;

/** A plain number of at most `MAX_PRICE_DIGITS` significant digits; commas as thousands separators are refused (ambiguous with decimal commas). */
function price(cell: string | undefined): string | null {
  const t = (cell ?? '').trim();
  return isTypedNumber(t) && significantDigits(t) <= MAX_PRICE_DIGITS ? t : null;
}

/** Parses "±HH:MM" (e.g. "+02:00", "-05:30") into minutes east of UTC, or null. */
export function parseUtcOffset(text: string): number | null {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  if (Number(m[2]) > 14 || Number(m[3]) > 59 || minutes > 14 * 60) return null;
  return m[1] === '-' ? -minutes : minutes;
}

export const formatUtcOffset = (minutes: number) => `${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;

/** How far past the device clock a candle may be dated (clock skew; daily candles carry the exchange's local date). */
const FUTURE_MARGIN_MS = { intraday: 15 * 60_000, daily: 36 * 3_600_000 } as const;

function readRows(raw: readonly RawRow[], unit: string, offsetMinutes: number) {
  const errors: string[] = [];
  const rows: Row[] = [];
  let naive = 0;
  for (const r of raw) {
    const at = `${unit} ${r.line}`;
    const time = parseTimestamp(r.time);
    const o = price(r.open);
    const h = price(r.high);
    const l = price(r.low);
    const c = price(r.close);
    if (!time) {
      errors.push(`${at}: "${r.time.slice(0, 30)}" is not a date and time the app can read`);
      continue;
    }
    if (!o || !h || !l || !c) {
      errors.push(`${at}: open, high, low and close must all be plain numbers of at most ${MAX_PRICE_DIGITS} digits`);
      continue;
    }
    const [open, high, low, close] = [dec(o), dec(h), dec(l), dec(c)];
    if (open.lte(0) || high.lte(0) || low.lte(0) || close.lte(0)) {
      errors.push(`${at}: prices must be above zero`);
      continue;
    }
    if (high.lt(open) || high.lt(close) || low.gt(open) || low.gt(close) || low.gt(high)) {
      errors.push(`${at}: high and low do not contain open and close`);
      continue;
    }
    const v = (r.volume ?? '').trim();
    if (v !== '' && (!isTypedNumber(v) || dec(v).lt(0))) {
      errors.push(`${at}: volume must be a number of 0 or more`);
      continue;
    }
    if (!time.zoned) naive += 1;
    // Zone-less times are local times at the chosen offset; UTC = local − offset.
    rows.push({ line: r.line, ms: time.zoned ? time.ms : time.ms - offsetMinutes * 60_000, candle: { open, high, low, close, volume: v === '' ? null : dec(v) } });
  }
  return { errors, rows, naive };
}

/** Puts rows in time order, refusing duplicates and rows out of order; data entirely newest-first is reversed, with a warning. */
function orderRows(rows: readonly Row[], unit: string): { readonly rows: readonly Row[]; readonly errors: readonly string[]; readonly warnings: readonly string[] } {
  const descending = rows.length > 1 && rows.every((r, i) => i === 0 || r.ms < (rows[i - 1] as Row).ms);
  const ordered = descending ? [...rows].reverse() : rows;
  const errors: string[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1] as Row;
    const cur = ordered[i] as Row;
    if (cur.ms === prev.ms) errors.push(`${unit} ${cur.line}: the same time as ${unit} ${prev.line} (duplicate candle)`);
    else if (cur.ms < prev.ms) errors.push(`${unit} ${cur.line}: earlier than ${unit} ${prev.line}; rows must be in time order`);
  }
  return { rows: ordered, errors, warnings: descending ? ['The data was newest-first; it was put in time order.'] : [] };
}

export interface RowCheckOptions {
  /** "line" for files, "row" for provider responses. */
  readonly unit: string;
  /** The device clock; candles dated after it (beyond a small margin) are refused. */
  readonly nowMs: number;
  /** Minutes east of UTC that zone-less times use (0 for UTC). */
  readonly utcOffsetMinutes?: number;
  /** The date and time came from separate columns that were joined (explains duplicates). */
  readonly joinedDateTime?: boolean;
  /** False when the source has no volume at all. */
  readonly volumeColumn: boolean;
  /** Times without a zone were requested in UTC (a provider asked for UTC), so no warning is needed. */
  readonly naiveIsUtc: boolean;
}

/** The strict checks shared by CSV files and provider data: every row, order, timeframe, spacing, gaps. */
export function checkRawRows(raw: readonly RawRow[], options: RowCheckOptions): CsvImportResult {
  const { unit } = options;
  const total = raw.length;
  const offset = options.utcOffsetMinutes ?? 0;
  const { errors, rows, naive } = readRows(raw, unit, offset);
  if (errors.length > 0) return refused(total, errors);
  const ordered = orderRows(rows, unit);
  if (ordered.errors.length > 0) {
    const duplicates = ordered.errors.some((e) => e.includes('duplicate candle'));
    const hint = duplicates && options.joinedDateTime ? ['The date and time were in separate columns and were joined; rows with the same date and time are duplicates. Check that the time column holds each candle’s time.'] : [];
    return refused(total, [...hint, ...ordered.errors]);
  }
  if (ordered.rows.length < CSV_LIMITS.minCandles) return refused(total, [`At least ${CSV_LIMITS.minCandles} candles are needed; there are ${ordered.rows.length}.`]);
  if (ordered.rows.length > CSV_LIMITS.maxCandles) return refused(total, [`At most ${CSV_LIMITS.maxCandles.toLocaleString('en-US')} candles can be used; there are ${ordered.rows.length.toLocaleString('en-US')}.`]);
  const timeframe = detectTimeframe(ordered.rows.map((r) => r.ms));
  if (!timeframe) return refused(total, ['The spacing between candles does not match any timeframe the app supports (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w).']);
  const margin = timeframe === 'D1' || timeframe === 'W1' ? FUTURE_MARGIN_MS.daily : FUTURE_MARGIN_MS.intraday;
  const future = ordered.rows.filter((r) => r.ms > options.nowMs + margin);
  if (future.length > 0) {
    return refused(total, future.map((r) => `${unit} ${r.line}: dated ${new Date(r.ms).toISOString().slice(0, 16).replace('T', ' ')} UTC, which is in the future`));
  }
  const step = TIMEFRAME_MINUTES[timeframe] * 60_000;
  const offGrid = ordered.rows.filter((r, i) => i > 0 && (r.ms - (ordered.rows[i - 1] as Row).ms) % step !== 0);
  if (offGrid.length > 0) return refused(total, offGrid.map((r) => `${unit} ${r.line}: spacing to the previous candle is not a whole number of ${timeframe} candles`));
  const gaps = ordered.rows.filter((r, i) => i > 0 && r.ms - (ordered.rows[i - 1] as Row).ms > step).length;
  const candles: Candle[] = ordered.rows.map((r) => ({ ...r.candle, time: new Date(r.ms).toISOString() as UtcIso }));
  const hasVolume = candles.some((c) => c.volume !== null);
  const warnings = [
    ...ordered.warnings,
    ...(naive > 0 && !options.naiveIsUtc
      ? [
          offset === 0
            ? `${naive === candles.length ? 'The times have no time zone, so they were read as UTC' : `${naive} times have no time zone; those were read as UTC`}. If the file uses another zone, set its UTC offset so the times are shifted correctly.`
            : `${naive === candles.length ? 'The times have no time zone' : `${naive} times have no time zone`}; they were read as UTC${formatUtcOffset(offset)} (the offset you chose) and converted to UTC.`,
        ]
      : []),
    ...(gaps > 0 ? [`${gaps} gap${gaps === 1 ? '' : 's'} where candles are missing (weekends and holidays are normal gaps). Trades across a gap may fill at very different prices.`] : []),
    ...(!options.volumeColumn ? ['There is no volume; volume tools are not available for this data.'] : !hasVolume ? ['The volume is empty.'] : []),
    'Prices are used as they are: the app does not adjust for splits, dividends or futures rollovers.',
  ];
  return {
    candles,
    report: {
      // The adjustment note is always there; anything beyond it is a real warning.
      status: warnings.length > 1 ? 'warnings' : 'ok',
      rows: total,
      candles: candles.length,
      timeframe,
      first: (candles[0] as Candle).time,
      last: (candles[candles.length - 1] as Candle).time,
      hasVolume,
      errors: [],
      warnings: cap(warnings),
    },
  };
}

export interface CsvOptions {
  readonly nowMs: number;
  readonly utcOffsetMinutes?: number;
}

/** Separate date and time columns (e.g. MetaTrader's `<DATE>,<TIME>`), when both are present. */
function dateTimeColumns(cells: readonly string[]): { readonly date: number; readonly time: number } | null {
  const lower = cells.map((c) => c.replace(/^\uFEFF/, '').replace(/[<>]/g, '').trim().toLowerCase());
  const date = lower.indexOf('date');
  const time = lower.indexOf('time');
  return date >= 0 && time >= 0 && date !== time ? { date, time } : null;
}

export function parseOhlcvCsv(text: string, options: CsvOptions): CsvImportResult {
  if (text.length > CSV_LIMITS.maxBytes) return refused(0, ['The file is larger than 5 MB.']);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const header = lines[0] ?? '';
  const delimiter = detectDelimiter(header);
  const headerCells = splitLine(header, delimiter);
  const cols = mapColumns(headerCells);
  const joined = dateTimeColumns(headerCells);
  const missing = (['time', 'open', 'high', 'low', 'close'] as const).filter((c) => cols[c] === undefined);
  if (missing.length > 0) {
    return refused(0, [`The first line must name the columns. Missing: ${missing.join(', ')}. Expected e.g. "date,open,high,low,close,volume".`]);
  }
  const at = (cells: readonly string[], col: Column): string => (cols[col] === undefined ? '' : (cells[cols[col] as number] ?? ''));
  const raw: RawRow[] = lines.slice(1).flatMap((line, i) => {
    if (line.trim() === '') return [];
    const cells = splitLine(line, delimiter);
    const time = joined ? `${cells[joined.date] ?? ''} ${cells[joined.time] ?? ''}`.trim() : at(cells, 'time');
    return [{ line: i + 2, time, open: at(cells, 'open'), high: at(cells, 'high'), low: at(cells, 'low'), close: at(cells, 'close'), ...(cols.volume === undefined ? {} : { volume: at(cells, 'volume') }) }];
  });
  return checkRawRows(raw, { unit: 'line', volumeColumn: cols.volume !== undefined, naiveIsUtc: false, nowMs: options.nowMs, utcOffsetMinutes: options.utcOffsetMinutes ?? 0, joinedDateTime: joined !== null });
}
