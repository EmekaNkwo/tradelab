import type { CalculatorField, CalculatorId, CalculatorLine, CalculatorValues } from '../../features/tools';
import { directionOf, signedText, spokenChange, type Direction } from '../ui/valueParts';

/** The result line each calculator leads with in its hero (brief §5.7). Presentation only; the lines are unchanged. */
export const HEADLINE: Readonly<Record<CalculatorId, string>> = {
  pip_value: 'One pip in your account currency',
  position_size: 'Position size',
  margin: 'Margin required',
  margin_status: 'Margin level',
  profit_loss: 'Result',
  risk_reward: 'Risk : reward',
  sizing_with_costs: 'Size',
  break_even: 'Win rate needed to break even',
  expectancy: 'Expectancy per trade',
  recovery: 'Gain needed to get back',
  losing_streak: 'Chance of at least one such streak',
  risk_of_ruin: 'Simulated runs that hit the ruin level',
  compounding: 'Ending amount',
  futures_contract: 'Profit or loss',
  option_payoff: 'Profit or loss at expiry',
};

/** A line written as a sentence (a note, a warning) rather than a figure. */
export function isProse(value: string): boolean {
  return value.trim().split(/\s+/).length >= 4;
}

export interface ResultView {
  /** The hero line, or null when the calculator has no lines. */
  readonly main: CalculatorLine | null;
  /** The other figures, in their order. */
  readonly details: readonly CalculatorLine[];
  /** Sentence lines (notes, warnings), listed with the assumptions. */
  readonly notes: readonly CalculatorLine[];
}

/** Splits a result into the hero line, the other figures and the notes, keeping every line exactly once. */
export function resultView(id: CalculatorId, lines: readonly CalculatorLine[]): ResultView {
  const main = lines.find((l) => l.label === HEADLINE[id]) ?? lines.find((l) => !isProse(l.value)) ?? lines[0] ?? null;
  const rest = lines.filter((l) => l !== main);
  return { main, details: rest.filter((l) => !isProse(l.value)), notes: rest.filter((l) => isProse(l.value)) };
}

const UNITS: Readonly<Record<string, string>> = { lots: 'lots', pips: 'pips', r: 'R' };
/** Fields that hold an amount in the account currency. */
const ACCOUNT_AMOUNTS = new Set(['balance', 'equity', 'usedMargin', 'commission', 'pipValuePerLot']);

/**
 * The unit shown inside a field: from its label's closing brackets ("Size (lots)" → "lots", "Win rate (%)" → "%"),
 * or the account currency for an amount field when the form has one. Null when there is no clear unit.
 */
export function fieldUnit(field: CalculatorField, values: CalculatorValues): string | null {
  if (field.kind !== 'number' && field.kind !== 'signed') return null;
  const bracket = /\(([^)]+)\)\s*$/.exec(field.label)?.[1]?.trim();
  if (bracket?.startsWith('%')) return '%';
  const unit = bracket ? UNITS[bracket.toLowerCase()] : undefined;
  if (unit) return unit;
  const currency = (values.accountCurrency ?? '').trim().toUpperCase();
  return ACCOUNT_AMOUNTS.has(field.name) && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

/** Headlines that are a profit or loss: shown with a sign and an arrow, and spoken as a gain or loss (brief §1). */
const RESULT_HEADLINES: ReadonlySet<CalculatorId> = new Set<CalculatorId>(['profit_loss', 'futures_contract', 'option_payoff']);

export interface SignedHeadline {
  readonly direction: Direction;
  /** "+20.00 USD", "−20.00 USD" or "±0.00 USD". */
  readonly text: string;
  /** "Result, gain of 20.00 USD". */
  readonly spoken: string;
}

/**
 * The sign, arrow direction and words for a profit-or-loss headline; null for every other headline, or when the
 * value is not a plain number. The direction follows the value as shown, so "0.00" is no change.
 */
export function signedHeadline(id: CalculatorId, line: CalculatorLine): SignedHeadline | null {
  if (!RESULT_HEADLINES.has(id)) return null;
  const m = /^\s*([−-])?\s*(\d[\d,]*(?:\.(\d+))?)(.*)$/.exec(line.value);
  if (!m) return null;
  const magnitude = Number((m[2] ?? '').replace(/,/g, ''));
  const direction = directionOf(m[1] ? -magnitude : magnitude, m[3]?.length ?? 0);
  const shown = `${m[2] ?? ''}${m[4] ?? ''}`;
  return { direction, text: signedText(direction, shown), spoken: spokenChange(line.label, direction, shown, 'result') };
}
