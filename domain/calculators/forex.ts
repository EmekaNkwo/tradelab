import { dec, isTypedNumber, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';

/**
 * Forex calculators (spec §8.1 module 2, §20). All arithmetic uses Decimal.
 * Inputs arrive as text from forms, so every function validates them and
 * returns a Result; nothing here throws on bad input.
 *
 * Conventions:
 * - A standard lot is 100,000 units of the base currency.
 * - A pip is 0.01 for JPY-quoted pairs and 0.0001 for others.
 * - Converting quote-currency money to the account currency: if the account is
 *   in the quote currency nothing changes; if it is in the base currency we
 *   divide by the pair's price; otherwise the learner supplies the rate.
 */

export const STANDARD_LOT = dec(100000);
export const LOT_STEP = dec('0.01');

export interface CurrencyPair {
  readonly base: string;
  readonly quote: string;
}

export type TradeSide = 'buy' | 'sell';

const CURRENCY = /^[A-Z]{3}$/;

/**
 * Currencies the forex calculators accept. Metals (XAU, XAG) and crypto use
 * different contract sizes and price steps, so they are refused rather than
 * silently treated as currency pairs.
 */
export const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set([
  'USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'HUF', 'CZK', 'TRY',
  'ZAR', 'MXN', 'SGD', 'HKD', 'CNH', 'ILS', 'THB', 'NGN', 'KES', 'GHS', 'INR', 'BRL',
]);

export function parsePair(text: string): Result<CurrencyPair, AppError> {
  const cleaned = text.trim().toUpperCase().replace(/[/\-\s]/g, '');
  if (!/^[A-Z]{6}$/.test(cleaned)) return err(validationError('Enter a pair like EUR/USD'));
  const base = cleaned.slice(0, 3);
  const quote = cleaned.slice(3);
  if (base === quote) return err(validationError('A pair needs two different currencies'));
  const unknown = [base, quote].find((c) => !SUPPORTED_CURRENCIES.has(c));
  if (unknown) return err(validationError(`${unknown} is not a currency these calculators support. Metals and crypto use different contract sizes.`));
  return ok({ base, quote });
}

export function pipSizeFor(pair: CurrencyPair): Decimal {
  return dec(pair.quote === 'JPY' ? '0.01' : '0.0001');
}

type Fields = Readonly<Record<string, string | undefined>>;

/** Parses named text fields as positive decimals (or ≥ 0 when listed in `allowZero`). */
function positives<K extends string>(fields: Fields, names: readonly K[], allowZero: readonly K[] = []): Result<Record<K, Decimal>, AppError> {
  const out = {} as Record<K, Decimal>;
  for (const name of names) {
    // Many phone keyboards type a comma as the decimal separator.
    const raw = (fields[name]?.trim() ?? '').replace(',', '.');
    if (!isTypedNumber(raw)) return err(validationError(`${name} must be a number`, { issues: [name] }));
    const v = dec(raw);
    if (allowZero.includes(name) ? v.isNegative() : v.lte(0)) {
      return err(validationError(`${name} must be ${allowZero.includes(name) ? 'zero or more' : 'more than zero'}`, { issues: [name] }));
    }
    out[name] = v;
  }
  return ok(out);
}

function currency(code: string): Result<string, AppError> {
  const c = code.trim().toUpperCase();
  return CURRENCY.test(c) && SUPPORTED_CURRENCIES.has(c) ? ok(c) : err(validationError('Account currency must be a 3-letter code like USD', { issues: ['accountCurrency'] }));
}

/** Converts quote-currency money to the account currency (see the module comment). */
function quoteToAccount(amount: Decimal, pair: CurrencyPair, account: string, price: Decimal, rate: string | undefined): Result<Decimal, AppError> {
  if (account === pair.quote) return ok(amount);
  if (account === pair.base) return ok(amount.div(price));
  const r = positives({ quoteToAccountRate: rate }, ['quoteToAccountRate']);
  return r.ok ? ok(amount.times(r.value.quoteToAccountRate)) : err(validationError(`Enter how many ${account} one ${pair.quote} is worth`, { issues: ['quoteToAccountRate'] }));
}

export interface PipValueInput {
  readonly pair: string;
  readonly lots: string;
  readonly accountCurrency: string;
  /** Current price of the pair (quote per base). */
  readonly price: string;
  /** Needed only when the account currency is neither the base nor the quote. */
  readonly quoteToAccountRate?: string;
}

export interface PipValueResult {
  readonly pipSize: Decimal;
  readonly units: Decimal;
  readonly inQuote: Decimal;
  readonly inAccount: Decimal;
}

export function pipValue(input: PipValueInput): Result<PipValueResult, AppError> {
  const pair = parsePair(input.pair);
  if (!pair.ok) return pair;
  const account = currency(input.accountCurrency);
  if (!account.ok) return account;
  const n = positives(input as unknown as Fields, ['lots', 'price']);
  if (!n.ok) return n;
  const size = pipSizeFor(pair.value);
  const units = n.value.lots.times(STANDARD_LOT);
  const inQuote = units.times(size);
  const inAccount = quoteToAccount(inQuote, pair.value, account.value, n.value.price, input.quoteToAccountRate);
  if (!inAccount.ok) return inAccount;
  return ok({ pipSize: size, units, inQuote, inAccount: inAccount.value });
}

export interface PositionSizeInput {
  readonly balance: string;
  readonly riskPercent: string;
  readonly stopPips: string;
  /** Value of one pip for one standard lot, in the account currency. */
  readonly pipValuePerLot: string;
}

export interface PositionSizeResult {
  readonly riskAmount: Decimal;
  /** Rounded down to the 0.01 lot step so the risk never exceeds the budget. */
  readonly lots: Decimal;
  readonly actualRisk: Decimal;
  readonly belowMinimumLot: boolean;
}

export function positionSize(input: PositionSizeInput): Result<PositionSizeResult, AppError> {
  const n = positives(input as unknown as Fields, ['balance', 'riskPercent', 'stopPips', 'pipValuePerLot']);
  if (!n.ok) return n;
  const { balance, riskPercent, stopPips, pipValuePerLot } = n.value;
  if (riskPercent.gt(100)) return err(validationError('Risk cannot be more than 100% of the balance', { issues: ['riskPercent'] }));
  const riskAmount = balance.times(riskPercent).div(100);
  const exact = riskAmount.div(stopPips.times(pipValuePerLot));
  const lots = exact.div(LOT_STEP).floor().times(LOT_STEP);
  return ok({ riskAmount, lots, actualRisk: lots.times(stopPips).times(pipValuePerLot), belowMinimumLot: lots.isZero() });
}

export interface MarginInput {
  readonly pair: string;
  readonly lots: string;
  readonly price: string;
  /** The "30" in 1:30. */
  readonly leverage: string;
  readonly accountCurrency: string;
  /** Needed only when the account currency is neither the base nor the quote. */
  readonly baseToAccountRate?: string;
}

export interface MarginResult {
  readonly units: Decimal;
  readonly notionalInAccount: Decimal;
  readonly margin: Decimal;
}

export function marginRequired(input: MarginInput): Result<MarginResult, AppError> {
  const pair = parsePair(input.pair);
  if (!pair.ok) return pair;
  const account = currency(input.accountCurrency);
  if (!account.ok) return account;
  const n = positives(input as unknown as Fields, ['lots', 'price', 'leverage']);
  if (!n.ok) return n;
  const units = n.value.lots.times(STANDARD_LOT);
  let notional: Decimal;
  if (account.value === pair.value.base) notional = units;
  else if (account.value === pair.value.quote) notional = units.times(n.value.price);
  else {
    const r = positives({ baseToAccountRate: input.baseToAccountRate }, ['baseToAccountRate']);
    if (!r.ok) return err(validationError(`Enter how many ${account.value} one ${pair.value.base} is worth`, { issues: ['baseToAccountRate'] }));
    notional = units.times(r.value.baseToAccountRate);
  }
  return ok({ units, notionalInAccount: notional, margin: notional.div(n.value.leverage) });
}

export interface MarginStatusResult {
  readonly freeMargin: Decimal;
  /** Equity ÷ used margin × 100; null when no margin is in use. */
  readonly marginLevelPercent: Decimal | null;
}

export function marginStatus(input: { readonly equity: string; readonly usedMargin: string }): Result<MarginStatusResult, AppError> {
  const equityText = input.equity.trim().replace(',', '.');
  if (!isTypedNumber(equityText)) return err(validationError('equity must be a number', { issues: ['equity'] }));
  const used = positives(input, ['usedMargin'], ['usedMargin']);
  if (!used.ok) return used;
  const equity = dec(equityText);
  const u = used.value.usedMargin;
  return ok({ freeMargin: equity.minus(u), marginLevelPercent: u.isZero() ? null : equity.div(u).times(100) });
}

export interface ProfitLossInput {
  readonly pair: string;
  readonly side: TradeSide;
  readonly entry: string;
  readonly exit: string;
  readonly lots: string;
  readonly accountCurrency: string;
  readonly quoteToAccountRate?: string;
}

export interface ProfitLossResult {
  readonly pips: Decimal;
  readonly inQuote: Decimal;
  /** Converted at the exit price when the account is in the base currency. */
  readonly inAccount: Decimal;
}

export function profitLoss(input: ProfitLossInput): Result<ProfitLossResult, AppError> {
  const pair = parsePair(input.pair);
  if (!pair.ok) return pair;
  const account = currency(input.accountCurrency);
  if (!account.ok) return account;
  const n = positives(input as unknown as Fields, ['entry', 'exit', 'lots']);
  if (!n.ok) return n;
  const { entry, exit, lots } = n.value;
  const move = input.side === 'buy' ? exit.minus(entry) : entry.minus(exit);
  const inQuote = move.times(lots).times(STANDARD_LOT);
  const inAccount = quoteToAccount(inQuote, pair.value, account.value, exit, input.quoteToAccountRate);
  if (!inAccount.ok) return inAccount;
  return ok({ pips: move.div(pipSizeFor(pair.value)), inQuote, inAccount: inAccount.value });
}

export interface RiskRewardResult {
  readonly risk: Decimal;
  readonly reward: Decimal;
  /** Reward ÷ risk, e.g. 2 means "1:2". */
  readonly ratio: Decimal;
}

export function riskReward(input: { readonly side: TradeSide; readonly entry: string; readonly stop: string; readonly target: string }): Result<RiskRewardResult, AppError> {
  const n = positives(input, ['entry', 'stop', 'target']);
  if (!n.ok) return n;
  const { entry, stop, target } = n.value;
  const buy = input.side === 'buy';
  const risk = buy ? entry.minus(stop) : stop.minus(entry);
  const reward = buy ? target.minus(entry) : entry.minus(target);
  if (risk.lte(0)) return err(validationError(`For a ${input.side} the stop must be ${buy ? 'below' : 'above'} the entry`, { issues: ['stop'] }));
  if (reward.lte(0)) return err(validationError(`For a ${input.side} the target must be ${buy ? 'above' : 'below'} the entry`, { issues: ['target'] }));
  return ok({ risk, reward, ratio: reward.div(risk) });
}
