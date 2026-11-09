import { dec, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { TradeSide } from './forex';

/**
 * Option payoff at expiry (Options module). Only the value at expiry is worked out: before expiry an option's price
 * also depends on time left and expected volatility, which needs a pricing model this calculator does not pretend to
 * have. The learner enters every number; the multiplier differs by contract, so none is assumed.
 */
export type OptionKind = 'call' | 'put';

export interface OptionInput {
  readonly kind: OptionKind;
  /** Buy = hold the right; sell = write the option and take on the obligation. */
  readonly side: TradeSide;
  readonly contracts: Decimal;
  /** Units of the underlying one contract covers. */
  readonly multiplier: Decimal;
  readonly strike: Decimal;
  /** Per unit of the underlying. */
  readonly premium: Decimal;
  /** Price of the underlying at expiry. */
  readonly expiryPrice: Decimal;
}

export type Moneyness = 'in' | 'at' | 'out';
export type Limit = { readonly kind: 'amount'; readonly amount: Decimal } | { readonly kind: 'unlimited' };

export interface OptionResult {
  readonly moneyness: Moneyness;
  /** What the option is worth per unit at expiry: never below zero. */
  readonly intrinsicPerUnit: Decimal;
  /** Premium paid (buyer) or received (seller) for the whole position. */
  readonly premiumTotal: Decimal;
  /** Signed, for the whole position. */
  readonly profitLoss: Decimal;
  /** Underlying price at expiry where the position neither gains nor loses; null when it would be zero or below. */
  readonly breakEven: Decimal | null;
  readonly maxLoss: Limit;
  readonly maxGain: Limit;
}

const fail = (message: string, field: string): Result<never, AppError> => err(validationError(message, { issues: [field] }));
const ZERO = dec(0);

function validate(i: OptionInput): Result<null, AppError> {
  if (!i.contracts.isInteger() || i.contracts.lt(1)) return fail('Contracts must be a whole number of at least 1', 'contracts');
  if (i.multiplier.lte(0)) return fail('Units per contract must be more than 0', 'multiplier');
  if (i.strike.lte(0)) return fail('Strike price must be more than 0', 'strike');
  if (i.premium.lt(0)) return fail('Premium cannot be negative', 'premium');
  if (i.expiryPrice.lt(0)) return fail('Price at expiry cannot be negative', 'expiryPrice');
  return ok(null);
}

export function optionAtExpiry(input: OptionInput): Result<OptionResult, AppError> {
  const valid = validate(input);
  if (!valid.ok) return valid;
  const { kind, side, contracts, multiplier, strike, premium, expiryPrice } = input;
  const units = multiplier.times(contracts);
  const isCall = kind === 'call';
  const gap = isCall ? expiryPrice.minus(strike) : strike.minus(expiryPrice);
  const intrinsicPerUnit = larger(gap, ZERO);
  const moneyness: Moneyness = gap.gt(0) ? 'in' : gap.isZero() ? 'at' : 'out';
  const premiumTotal = premium.times(units);
  const buyerPnL = intrinsicPerUnit.minus(premium).times(units);
  const breakEvenPrice = isCall ? strike.plus(premium) : strike.minus(premium);
  // A put's value is largest when the underlying falls to zero; a call's has no ceiling.
  const putFloorValue = strike.minus(premium).times(units);
  const buyer = side === 'buy';
  const premiumLimit: Limit = { kind: 'amount', amount: premiumTotal };
  const putLimit: Limit = { kind: 'amount', amount: larger(putFloorValue, ZERO) };
  return ok({
    moneyness,
    intrinsicPerUnit,
    premiumTotal,
    profitLoss: buyer ? buyerPnL : buyerPnL.negated(),
    breakEven: breakEvenPrice.gt(0) ? breakEvenPrice : null,
    maxLoss: buyer ? premiumLimit : isCall ? { kind: 'unlimited' } : putLimit,
    maxGain: buyer ? (isCall ? { kind: 'unlimited' } : putLimit) : premiumLimit,
  });
}

function larger(a: Decimal, b: Decimal): Decimal {
  return a.gt(b) ? a : b;
}
