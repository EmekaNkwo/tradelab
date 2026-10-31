import DecimalJs from 'decimal.js';

/**
 * The one Decimal type used for all money and prices (spec §19, §32A.6).
 * A dedicated clone keeps our configuration isolated from any other user of
 * decimal.js. Rounding to instrument precision is always explicit.
 */
export const Decimal = DecimalJs.clone({
  precision: 34,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -20,
  toExpPos: 30,
});
// Same name for the constructor and its instance type, like a class.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type Decimal = InstanceType<typeof Decimal>;

export type DecimalInput = Decimal | string | number;

export type RoundingMode = 'half-even' | 'half-up' | 'down' | 'up';

const ROUNDING: Record<RoundingMode, DecimalJs.Rounding> = {
  'half-even': DecimalJs.ROUND_HALF_EVEN,
  'half-up': DecimalJs.ROUND_HALF_UP,
  down: DecimalJs.ROUND_DOWN,
  up: DecimalJs.ROUND_UP,
};

export function dec(value: DecimalInput): Decimal {
  return new Decimal(value);
}

/**
 * True for a number as a person types it: digits with an optional sign and
 * decimal point. Rejects forms Decimal would accept but nobody means, such as
 * "0x10", "0b1" and "1e5". Use for form input; use `isDecimalString` for stored values.
 */
export function isTypedNumber(value: string): boolean {
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value);
}

/** True when `value` parses to a finite decimal. */
export function isDecimalString(value: string): boolean {
  try {
    return new Decimal(value).isFinite();
  } catch {
    return false;
  }
}

export function roundTo(value: DecimalInput, decimalPlaces: number, mode: RoundingMode = 'half-even'): Decimal {
  return dec(value).toDecimalPlaces(decimalPlaces, ROUNDING[mode]);
}

/** Fixed-point string for storage and display; never uses exponent notation. */
export function toFixedString(value: DecimalInput, decimalPlaces: number, mode: RoundingMode = 'half-even'): string {
  return dec(value).toFixed(decimalPlaces, ROUNDING[mode]);
}

export function sum(values: readonly DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), dec(0));
}
