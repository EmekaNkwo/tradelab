/** Pure view-model helpers for numbers on cards: split decimals, signed changes, and what screen readers say. */

export interface SplitParts {
  /** Everything before the decimal point, e.g. "$10,430". */
  readonly integer: string;
  /** The decimal point and digits, e.g. ".25" ("" when there are none). */
  readonly decimals: string;
  /** Anything after the digits, e.g. "%" or " R" ("" when there is none). */
  readonly suffix: string;
}

/**
 * "$10,430.25" → "$10,430" + ".25"; "4.3%" → "4" + ".3" + "%"; "1,200" → "1,200".
 *
 * Input is en-formatted (comma thousands, dot decimal), as every TradeLab formatter produces, so "1.234" is one
 * point two three four. A value with more than one dot (e.g. a de-formatted "1.234.567") is not split at all,
 * rather than splitting it in the wrong place.
 */
export function splitDecimal(value: string): SplitParts {
  if ((value.match(/\./g) ?? []).length > 1) return { integer: value, decimals: '', suffix: '' };
  const match = /^(.*\d)(\.\d+)(\D*)$/.exec(value);
  if (!match) return { integer: value, decimals: '', suffix: '' };
  return { integer: match[1] ?? value, decimals: match[2] ?? '', suffix: match[3] ?? '' };
}

export type Direction = 'up' | 'down' | 'flat';

/**
 * The direction of a signed number; zero (and NaN) is flat. Pass the number of decimals the value is shown with,
 * so a value that displays as zero (−0.04 shown to 1 dp is "0.0") is flat, not "−0.0".
 */
export function directionOf(n: number, shownDecimals?: number): Direction {
  const shown = shownDecimals === undefined ? n : Number(n.toFixed(Math.max(0, Math.min(20, shownDecimals))));
  if (shown > 0) return 'up';
  if (shown < 0) return 'down';
  return 'flat';
}

/** The true minus sign (U+2212), not a hyphen. */
export const MINUS = '−';

/** The visible sign for a direction: "+", "−", or "±" for no change, so a sign is always shown. */
export function signFor(direction: Direction): string {
  if (direction === 'up') return '+';
  if (direction === 'down') return MINUS;
  return '±';
}

/** Display text without a leading sign: "−1.7R" → "1.7R". */
export function unsigned(text: string): string {
  return text.replace(/^[+\-−±]/, '');
}

/** "+4.3%" from ("up", "4.3%"). `magnitude` is the unsigned display text; a leading sign in it is dropped. */
export function signedText(direction: Direction, magnitude: string): string {
  return `${signFor(direction)}${unsigned(magnitude)}`;
}

/** Spoken direction, never a symbol: TalkBack reads "+" and "−" inconsistently. */
export function spokenDirection(direction: Direction, kind: 'change' | 'result'): string {
  if (kind === 'result') {
    if (direction === 'up') return 'gain of';
    if (direction === 'down') return 'loss of';
    return 'no gain or loss,';
  }
  if (direction === 'up') return 'up';
  if (direction === 'down') return 'down';
  return 'no change,';
}

/** "Quiz accuracy, up 4.3%" — the subject first, then direction in words, then the unsigned value. */
export function spokenChange(subject: string | undefined, direction: Direction, magnitude: string, kind: 'change' | 'result' = 'change'): string {
  const value = unsigned(magnitude);
  const phrase = `${spokenDirection(direction, kind)} ${value}`;
  return subject ? `${subject}, ${phrase}` : phrase;
}

/** A percentage clamped to 0–100; non-finite input is 0. */
export function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, p));
}

/**
 * Money text for screen readers: a leading minus (U+2212 or a hyphen) becomes the word "minus", because TalkBack
 * reads the symbols inconsistently. "−12.40 USD" → "minus 12.40 USD".
 */
export function spokenAmount(text: string): string {
  return text.replace(/^\s*[−-]\s*/, 'minus ');
}
