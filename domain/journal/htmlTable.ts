/**
 * A small, forgiving reader for HTML tables. It is not a general HTML parser:
 * it only finds `<tr>` rows and their `<td>`/`<th>` cells, which is all a
 * MetaTrader statement needs. It never runs or evaluates anything.
 *
 * - Tag and attribute names are matched without regard to case.
 * - Tags nested inside a cell (`<b>`, `<div>`, `<span>` …) are dropped; their text is kept.
 * - Missing `</td>` and `</tr>` tags are tolerated (old MT4 files often leave them out).
 * - Comments, `<script>` and `<style>` blocks are removed first.
 * - Entities such as `&nbsp;`, `&amp;` and `&#160;` are decoded once.
 */

export interface TableCell {
  /** Decoded text with runs of whitespace collapsed to one space and trimmed. */
  readonly text: string;
  /** First column this cell occupies, counting `colspan` of earlier cells. */
  readonly start: number;
  /** Number of columns it spans (from `colspan`, at least 1). */
  readonly span: number;
}

export interface TableRow {
  readonly cells: readonly TableCell[];
}

const MAX_COLSPAN = 100;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  minus: '-',
  ndash: '-',
};

function safeCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  return String.fromCodePoint(code);
}

/** Decodes the common named entities and all numeric ones; unknown entities are left as written. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16)) ?? whole;
    if (lower.startsWith('#')) return safeCodePoint(parseInt(lower.slice(1), 10)) ?? whole;
    return NAMED_ENTITIES[lower] ?? whole;
  });
}

/** Turns every kind of whitespace (including no-break and thin spaces) into single spaces. */
export function collapseWhitespace(text: string): string {
  return text.replace(/[\s   ]+/g, ' ').trim();
}

/**
 * Removes every block from `open` to `close` (both case-insensitive). An
 * unclosed block runs to the end. Uses indexOf, so the time stays linear even
 * on hostile input.
 */
function removeBlocks(source: string, open: string, close: string): string {
  const lower = source.toLowerCase();
  const parts: string[] = [];
  let from = 0;
  for (let start = lower.indexOf(open, from); start !== -1; start = lower.indexOf(open, from)) {
    parts.push(source.slice(from, start), ' ');
    const end = lower.indexOf(close, start + open.length);
    if (end === -1) return parts.join('');
    from = end + close.length;
  }
  parts.push(source.slice(from));
  return parts.join('');
}

function stripNoise(html: string): string {
  const withoutComments = removeBlocks(html, '<!--', '-->');
  return removeBlocks(removeBlocks(withoutComments, '<script', '</script>'), '<style', '</style>');
}

function colspanOf(attributes: string): number {
  const match = /\bcolspan\s*=\s*["']?\s*(\d+)/i.exec(attributes);
  const value = match ? parseInt(match[1] ?? '1', 10) : 1;
  return Math.min(Math.max(Number.isFinite(value) ? value : 1, 1), MAX_COLSPAN);
}

/** Mutable state used only while scanning; never leaves this module. */
interface ScanState {
  readonly rows: TableRow[];
  cells: TableCell[] | null;
  openCell: { raw: string; span: number } | null;
  nextColumn: number;
}

function closeCell(state: ScanState): void {
  if (!state.openCell || !state.cells) return;
  const text = collapseWhitespace(decodeEntities(state.openCell.raw));
  state.cells.push({ text, start: state.nextColumn, span: state.openCell.span });
  state.nextColumn += state.openCell.span;
  state.openCell = null;
}

function closeRow(state: ScanState): void {
  closeCell(state);
  if (state.cells && state.cells.length > 0) state.rows.push({ cells: state.cells });
  state.cells = null;
  state.nextColumn = 0;
}

function handleTag(state: ScanState, closing: boolean, name: string, attributes: string): void {
  if (name === 'tr' || name === 'table' || name === 'tbody' || name === 'thead' || name === 'tfoot') {
    closeRow(state);
    if (name === 'tr' && !closing) state.cells = [];
    return;
  }
  if (name === 'td' || name === 'th') {
    closeCell(state);
    if (!closing) {
      if (!state.cells) state.cells = [];
      state.openCell = { raw: '', span: colspanOf(attributes) };
    }
    return;
  }
  // Any other tag inside a cell is dropped; a space keeps words apart (e.g. after <br>).
  if (state.openCell) state.openCell.raw += ' ';
}

/** Reads every table row in the document, in order, across all tables. */
export function readTableRows(html: string): readonly TableRow[] {
  const source = stripNoise(html);
  const state: ScanState = { rows: [], cells: null, openCell: null, nextColumn: 0 };
  const tag = /<(\/?)([a-z][a-z0-9]*)\b([^<>]*)>/gi;
  let last = 0;
  for (let match = tag.exec(source); match !== null; match = tag.exec(source)) {
    if (state.openCell) state.openCell.raw += source.slice(last, match.index);
    handleTag(state, match[1] === '/', (match[2] ?? '').toLowerCase(), match[3] ?? '');
    last = tag.lastIndex;
  }
  if (state.openCell) state.openCell.raw += source.slice(last);
  closeRow(state);
  return state.rows;
}

/** The whole document as plain text (tags removed, entities decoded), for free-text searches. */
export function plainText(html: string): string {
  return collapseWhitespace(decodeEntities(stripNoise(html).replace(/<[^<>]*>/g, ' ')));
}

/** The cell that covers `column`, if any. */
export function cellAt(row: TableRow, column: number): TableCell | undefined {
  return row.cells.find((cell) => column >= cell.start && column < cell.start + cell.span);
}

/** Cells that have some text. */
export function filledCells(row: TableRow): readonly TableCell[] {
  return row.cells.filter((cell) => cell.text !== '');
}
