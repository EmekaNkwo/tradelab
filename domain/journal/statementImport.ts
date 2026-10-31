import { dec, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { cellAt, collapseWhitespace, filledCells, plainText, readTableRows, type TableRow } from './htmlTable';

/**
 * MetaTrader statement import (spec §14.4). Reads the closed trades from an
 * MT4 or MT5 HTML account statement that the learner exported from a DEMO
 * account. The parser is pure: no DOM, no network, no clock. It reads text
 * only and never evaluates anything in the file.
 *
 * Format assumptions (checked against synthetic files only; a real-broker
 * sample check is still needed, spec §37.2):
 * - MT4: closed trades sit under a "Closed Transactions" heading and end at
 *   the section's total row or the next section heading.
 * - MT5: closed trades sit under a "Positions" heading (not "Open Positions").
 * - Columns are found by their header text; if no header row is found the
 *   usual column order is assumed.
 * - Numbers use "." for decimals and may use spaces as thousands separators
 *   ("1 234.56"). Commas are not accepted, so a comma-formatted number makes
 *   the row skipped rather than guessed.
 * - Blank commission, taxes or swap cells count as zero. MT4 "Taxes" are added
 *   to `commission` so that profit + commission + swap is still the net result.
 * - Symbols are trimmed and upper-cased; broker suffixes (".m", "pro") are kept.
 */

/** Largest statement accepted, in UTF-8 bytes. Real statements are far smaller. */
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

export type MtPlatform = 'mt4' | 'mt5';

export interface ImportedTrade {
  /** `${platform}:${account}:${ticket}` (or `${platform}:${ticket}` when the statement has no account number), used to skip trades imported before. */
  readonly externalId: string;
  /** MT4 order ticket or MT5 position id. */
  readonly ticket: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  /** Size in lots. */
  readonly volume: Decimal;
  /**
   * Open and close times as written in the statement, rewritten from
   * 'YYYY.MM.DD HH:MM[:SS]' to 'YYYY-MM-DDTHH:MM:SS'. They are in the broker's
   * SERVER time, not UTC, and carry no offset: the statement does not say
   * which zone the server uses.
   */
  readonly openTime: string;
  readonly closeTime: string;
  readonly openPrice: Decimal;
  readonly closePrice: Decimal;
  /** Null when the statement shows no stop loss (blank or 0). */
  readonly stopLoss: Decimal | null;
  /** Null when the statement shows no take profit (blank or 0). */
  readonly takeProfit: Decimal | null;
  /** In the account currency; usually zero or negative. Includes MT4 taxes. */
  readonly commission: Decimal;
  readonly swap: Decimal;
  /** Gross profit in the account currency, before commission and swap. */
  readonly profit: Decimal;
}

export interface SkippedRow {
  /** 1-based position of the row in the trades table, counting from the first row after the header. */
  readonly row: number;
  readonly reason: string;
}

export interface ParsedStatement {
  readonly platform: MtPlatform;
  /** Three-letter account currency when the statement states it, otherwise null. */
  readonly accountCurrency: string | null;
  readonly trades: readonly ImportedTrade[];
  readonly skipped: readonly SkippedRow[];
}

// ---------------------------------------------------------------------------
// Column layouts

type Column =
  | 'ticket'
  | 'openTime'
  | 'type'
  | 'volume'
  | 'symbol'
  | 'openPrice'
  | 'stopLoss'
  | 'takeProfit'
  | 'closeTime'
  | 'closePrice'
  | 'commission'
  | 'taxes'
  | 'swap'
  | 'profit';

type Layout = Readonly<Partial<Record<Column, number>>>;

/** Header names to look for, as [normalised header text, which occurrence (1 = first)]. */
type HeaderNames = Readonly<Record<Column, readonly (readonly [string, number])[]>>;

interface PlatformFormat {
  readonly platform: MtPlatform;
  /** Section headings, normalised (lower case, no trailing colon). */
  readonly heading: string;
  readonly headers: HeaderNames;
  /** Column order assumed when no header row can be found. */
  readonly defaultOrder: readonly Column[];
}

const REQUIRED: readonly Column[] = ['ticket', 'openTime', 'type', 'volume', 'symbol', 'openPrice', 'closeTime', 'closePrice', 'profit'];

const SHARED_HEADERS = {
  type: [['type', 1]],
  stopLoss: [['s/l', 1], ['sl', 1], ['stop loss', 1]],
  takeProfit: [['t/p', 1], ['tp', 1], ['take profit', 1]],
  openPrice: [['open price', 1], ['price', 1]],
  closePrice: [['close price', 1], ['price', 2]],
  commission: [['commission', 1]],
  taxes: [['taxes', 1], ['tax', 1]],
  swap: [['swap', 1]],
  profit: [['profit', 1]],
} as const satisfies Partial<HeaderNames>;

const MT4: PlatformFormat = {
  platform: 'mt4',
  heading: 'closed transactions',
  headers: {
    ...SHARED_HEADERS,
    ticket: [['ticket', 1], ['order', 1]],
    openTime: [['open time', 1]],
    closeTime: [['close time', 1]],
    volume: [['size', 1], ['volume', 1], ['lots', 1]],
    symbol: [['item', 1], ['symbol', 1]],
  },
  defaultOrder: ['ticket', 'openTime', 'type', 'volume', 'symbol', 'openPrice', 'stopLoss', 'takeProfit', 'closeTime', 'closePrice', 'commission', 'taxes', 'swap', 'profit'],
};

const MT5: PlatformFormat = {
  platform: 'mt5',
  heading: 'positions',
  headers: {
    ...SHARED_HEADERS,
    ticket: [['position', 1]],
    openTime: [['open time', 1], ['time', 1]],
    closeTime: [['close time', 1], ['time', 2]],
    volume: [['volume', 1], ['size', 1], ['lots', 1]],
    symbol: [['symbol', 1], ['item', 1]],
  },
  defaultOrder: ['openTime', 'ticket', 'symbol', 'type', 'volume', 'openPrice', 'stopLoss', 'takeProfit', 'closeTime', 'closePrice', 'commission', 'swap', 'profit'],
};

const FORMATS: readonly PlatformFormat[] = [MT4, MT5];

/** Section headings that end a trades section. */
const SECTION_HEADINGS: ReadonlySet<string> = new Set([
  'closed transactions',
  'open trades',
  'working orders',
  'summary',
  'details',
  'positions',
  'open positions',
  'orders',
  'deals',
  'results',
]);

function normaliseLabel(text: string): string {
  return collapseWhitespace(text.toLowerCase())
    .replace(/\s*\/\s*/g, '/')
    .replace(/:$/, '')
    .trim();
}

function headingOf(row: TableRow): string | null {
  const filled = filledCells(row);
  if (filled.length !== 1) return null;
  const label = normaliseLabel(filled[0]?.text ?? '');
  return SECTION_HEADINGS.has(label) ? label : null;
}

function findColumn(row: TableRow, names: readonly (readonly [string, number])[]): number | undefined {
  for (const [name, occurrence] of names) {
    const matches = row.cells.filter((cell) => normaliseLabel(cell.text) === name);
    const cell = matches[occurrence - 1];
    if (cell) return cell.start;
  }
  return undefined;
}

/** Builds a layout from a header row, or null when a required column is missing. */
function layoutFromHeader(row: TableRow, format: PlatformFormat): Layout | null {
  const entries = (Object.keys(format.headers) as Column[])
    .map((column) => [column, findColumn(row, format.headers[column])] as const)
    .filter((entry): entry is readonly [Column, number] => entry[1] !== undefined);
  const layout: Layout = Object.fromEntries(entries);
  return REQUIRED.every((column) => layout[column] !== undefined) ? layout : null;
}

function defaultLayout(format: PlatformFormat): Layout {
  return Object.fromEntries(format.defaultOrder.map((column, index) => [column, index]));
}

// ---------------------------------------------------------------------------
// Finding the trades table

interface TradesTable {
  readonly format: PlatformFormat;
  readonly layout: Layout;
  /** Rows after the header, up to (not including) the next section heading. */
  readonly rows: readonly TableRow[];
}

const HEADER_SEARCH_ROWS = 5;

function sectionEnd(rows: readonly TableRow[], from: number): number {
  const next = rows.findIndex((row, index) => index >= from && headingOf(row) !== null);
  return next === -1 ? rows.length : next;
}

function tableFromHeading(rows: readonly TableRow[], format: PlatformFormat): TradesTable | null {
  const headingIndex = rows.findIndex((row) => headingOf(row) === format.heading);
  if (headingIndex === -1) return null;
  const end = sectionEnd(rows, headingIndex + 1);
  const section = rows.slice(headingIndex + 1, end);
  const headerIndex = section.slice(0, HEADER_SEARCH_ROWS).findIndex((row) => layoutFromHeader(row, format) !== null);
  if (headerIndex === -1) return { format, layout: defaultLayout(format), rows: section };
  const layout = layoutFromHeader(section[headerIndex] as TableRow, format) as Layout;
  return { format, layout, rows: section.slice(headerIndex + 1) };
}

/** Used when the heading is missing or worded differently: finds the header row itself. */
function tableFromHeaderRow(rows: readonly TableRow[], format: PlatformFormat): TradesTable | null {
  for (let index = 0; index < rows.length; index += 1) {
    const layout = layoutFromHeader(rows[index] as TableRow, format);
    if (layout) return { format, layout, rows: rows.slice(index + 1, sectionEnd(rows, index + 1)) };
  }
  return null;
}

function findTradesTable(rows: readonly TableRow[]): TradesTable | null {
  for (const format of FORMATS) {
    const table = tableFromHeading(rows, format);
    if (table) return table;
  }
  for (const format of FORMATS) {
    const table = tableFromHeaderRow(rows, format);
    if (table) return table;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reading values

type Read<T> = Result<T, string>;

/** Parses "1 234.56", "-0.50" or "+3". Spaces of any kind are thousands separators. */
export function parseMtNumber(text: string): Decimal | null {
  const compact = text.replace(/[\s   ]/g, '').replace(/−/g, '-');
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(compact)) return null;
  return dec(compact.replace(/^\+/, ''));
}

/** Rewrites MT's 'YYYY.MM.DD HH:MM[:SS]' as 'YYYY-MM-DDTHH:MM:SS' (still server time). */
export function parseMtTime(text: string): string | null {
  const match = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match as unknown as readonly string[];
  const valid =
    Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31 &&
    Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59;
  return valid ? `${year}-${month}-${day}T${hour}:${minute}:${second}` : null;
}

function textAt(row: TableRow, layout: Layout, column: Column): string {
  const index = layout[column];
  return index === undefined ? '' : (cellAt(row, index)?.text ?? '');
}

function readPositive(row: TableRow, layout: Layout, column: Column, label: string): Read<Decimal> {
  const raw = textAt(row, layout, column);
  const first = raw.split('/')[0] ?? '';
  const value = parseMtNumber(first);
  if (!value) return err(raw === '' ? `Missing ${label}` : `${label} "${raw}" is not a number`);
  return value.gt(0) ? ok(value) : err(`${label} must be more than zero`);
}

function readAmount(row: TableRow, layout: Layout, column: Column, label: string, blankIsZero: boolean): Read<Decimal> {
  const raw = textAt(row, layout, column);
  if (raw === '') return blankIsZero ? ok(dec(0)) : err(`Missing ${label}`);
  const value = parseMtNumber(raw);
  return value ? ok(value) : err(`${label} "${raw}" is not a number`);
}

function readOptionalLevel(row: TableRow, layout: Layout, column: Column, label: string): Read<Decimal | null> {
  const raw = textAt(row, layout, column);
  if (raw === '') return ok(null);
  const value = parseMtNumber(raw);
  if (!value) return err(`${label} "${raw}" is not a number`);
  if (value.isNegative()) return err(`${label} cannot be negative`);
  return ok(value.isZero() ? null : value);
}

function readTime(row: TableRow, layout: Layout, column: Column, label: string): Read<string> {
  const raw = textAt(row, layout, column);
  const value = parseMtTime(raw);
  return value ? ok(value) : err(raw === '' ? `Missing ${label}` : `${label} "${raw}" is not a valid date and time`);
}

const PENDING_TYPE = /^(buy|sell)[ _]?(limit|stop|stop[ _]?limit)$/;

/** Why a row with this type is not a closed trade, or null for buy and sell. */
function reasonToSkipType(type: string, row: TableRow): string | null {
  if (type === 'buy' || type === 'sell') {
    return row.cells.some((cell) => /^cancell?ed$/i.test(cell.text)) ? 'Cancelled order, not a closed trade' : null;
  }
  if (type === '') return 'Missing trade type';
  if (type === 'balance') return 'Balance operation (deposit or withdrawal), not a trade';
  if (type === 'credit') return 'Credit operation, not a trade';
  if (PENDING_TYPE.test(type)) return 'Pending order that never filled (cancelled or expired)';
  return `Row type "${type}" is not a buy or sell trade`;
}

// ---------------------------------------------------------------------------
// Rows

interface Identity {
  readonly ticket: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
}

function readIdentity(row: TableRow, layout: Layout): Read<Identity> {
  const type = normaliseLabel(textAt(row, layout, 'type'));
  const typeProblem = reasonToSkipType(type, row);
  if (typeProblem) return err(typeProblem);
  const ticket = textAt(row, layout, 'ticket');
  if (!/^\d{1,20}$/.test(ticket)) return err(ticket === '' ? 'Missing ticket number' : `Ticket "${ticket}" is not a number`);
  const symbol = textAt(row, layout, 'symbol').toUpperCase();
  if (symbol === '' || symbol.length > 30) return err('Missing or invalid symbol');
  return ok({ ticket, symbol, side: type as 'buy' | 'sell' });
}

type TradeBody = Omit<ImportedTrade, 'externalId' | keyof Identity>;

/** Reads every value column; returns the first problem found. */
function readBody(row: TableRow, layout: Layout): Read<TradeBody> {
  const volume = readPositive(row, layout, 'volume', 'Volume');
  const openTime = readTime(row, layout, 'openTime', 'Open time');
  const closeTime = readTime(row, layout, 'closeTime', 'Close time');
  const openPrice = readPositive(row, layout, 'openPrice', 'Open price');
  const closePrice = readPositive(row, layout, 'closePrice', 'Close price');
  const stopLoss = readOptionalLevel(row, layout, 'stopLoss', 'Stop loss');
  const takeProfit = readOptionalLevel(row, layout, 'takeProfit', 'Take profit');
  const commission = readAmount(row, layout, 'commission', 'Commission', true);
  const taxes = readAmount(row, layout, 'taxes', 'Taxes', true);
  const swap = readAmount(row, layout, 'swap', 'Swap', true);
  const profit = readAmount(row, layout, 'profit', 'Profit', false);
  const reads = [volume, openTime, closeTime, openPrice, closePrice, stopLoss, takeProfit, commission, taxes, swap, profit];
  const failed = reads.find((read) => !read.ok);
  if (failed && !failed.ok) return err(failed.error);
  if (!(volume.ok && openTime.ok && closeTime.ok && openPrice.ok && closePrice.ok && stopLoss.ok && takeProfit.ok && commission.ok && taxes.ok && swap.ok && profit.ok)) {
    return err('Unreadable row');
  }
  if (closeTime.value < openTime.value) return err('Close time is before open time');
  return ok({
    volume: volume.value,
    openTime: openTime.value,
    closeTime: closeTime.value,
    openPrice: openPrice.value,
    closePrice: closePrice.value,
    stopLoss: stopLoss.value,
    takeProfit: takeProfit.value,
    commission: commission.value.plus(taxes.value),
    swap: swap.value,
    profit: profit.value,
  });
}

function parseTradeRow(row: TableRow, table: TradesTable): Read<ImportedTrade> {
  const identity = readIdentity(row, table.layout);
  if (!identity.ok) return identity;
  const body = readBody(row, table.layout);
  if (!body.ok) return body;
  return ok({ externalId: `${table.format.platform}:${identity.value.ticket}`, ...identity.value, ...body.value });
}

/** The MT4 total row: no ticket, and a wide blank first cell before the sums. */
function isTotalRow(row: TableRow, layout: Layout): boolean {
  const first = row.cells[0];
  return textAt(row, layout, 'ticket') === '' && first !== undefined && first.span >= 2;
}

interface Collected {
  readonly trades: readonly ImportedTrade[];
  readonly skipped: readonly SkippedRow[];
}

function collectTrades(table: TradesTable): Collected {
  const trades: ImportedTrade[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();
  const dataRows = table.rows.filter((row) => filledCells(row).length > 0);
  for (const [index, row] of dataRows.entries()) {
    if (isTotalRow(row, table.layout)) break;
    const parsed = parseTradeRow(row, table);
    const rowNumber = index + 1;
    if (!parsed.ok) skipped.push({ row: rowNumber, reason: parsed.error });
    else if (seen.has(parsed.value.externalId)) skipped.push({ row: rowNumber, reason: `Ticket ${parsed.value.ticket} appears more than once` });
    else {
      seen.add(parsed.value.externalId);
      trades.push(parsed.value);
    }
  }
  return { trades, skipped };
}

// ---------------------------------------------------------------------------
// Entry point

/** UTF-8 size of a string, without TextEncoder (not available everywhere). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function isTooLarge(html: string): boolean {
  if (html.length > MAX_STATEMENT_BYTES) return true;
  if (html.length * 3 <= MAX_STATEMENT_BYTES) return false;
  return utf8ByteLength(html) > MAX_STATEMENT_BYTES;
}

/** The account number printed at the top of the statement ("Account: 900001"), if any. */
function detectAccount(html: string): string | null {
  const match = /\baccount\s*:\s*(\d{3,20})\b/i.exec(plainText(html));
  return match?.[1] ?? null;
}

/** Ticket numbers repeat across accounts, so the account (when known) is part of the id. */
const withAccount = (t: ImportedTrade, account: string | null): ImportedTrade =>
  account ? { ...t, externalId: t.externalId.replace(/^([a-z0-9]+):/, `$1:${account}:`) } : t;

function detectCurrency(html: string): string | null {
  const match = /\bcurrency\s*:\s*([a-z]{3})\b/i.exec(plainText(html));
  return match?.[1] ? match[1].toUpperCase() : null;
}

/**
 * Parses an MT4 or MT5 HTML account statement. Rows that cannot be read are
 * listed in `skipped` with a reason; they never fail the whole import. Fails
 * only when the file is too large, is not a recognisable statement, or has no
 * closed buy or sell trades.
 */
export function parseMtStatement(html: string): Result<ParsedStatement, AppError> {
  if (typeof html !== 'string' || html.trim() === '') {
    return err(validationError('The file is empty', { issues: ['file'] }));
  }
  if (isTooLarge(html)) {
    return err(validationError(`The file is larger than ${MAX_STATEMENT_BYTES / (1024 * 1024)} MB`, { issues: ['file'] }));
  }
  const table = findTradesTable(readTableRows(html));
  if (!table) {
    return err(validationError('This file is not a MetaTrader 4 or MetaTrader 5 HTML statement', { issues: ['format'] }));
  }
  const { trades, skipped } = collectTrades(table);
  if (trades.length === 0) {
    return err(
      validationError('The statement has no closed buy or sell trades to import', {
        issues: skipped.map((s) => `Row ${s.row}: ${s.reason}`),
      }),
    );
  }
  const account = detectAccount(html);
  return ok({ platform: table.format.platform, accountCurrency: detectCurrency(html), trades: trades.map((t) => withAccount(t, account)), skipped });
}
