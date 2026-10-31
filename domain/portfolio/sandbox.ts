import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { createRng } from '../market/random';

/**
 * Long-term investing sandbox (spec §18): an index-like basket of every
 * simulated company against holding just one of them. The series are made
 * up by a seeded random model with the assumptions listed below; they
 * describe no real market, and the point is the spread of single-company
 * outcomes, not any return figure.
 */

export interface SandboxInput {
  readonly seed: number;
  readonly companies: number;
  readonly years: number;
  readonly startAmount: number;
}

export const SANDBOX_LIMITS = { companies: { min: 3, max: 30 }, years: { min: 1, max: 30 }, startAmount: { min: 100, max: 10_000_000 } } as const;

export interface SandboxResult {
  /** Basket value at the end of each month, starting with the start amount. */
  readonly basket: readonly number[];
  /** Each company's value if the whole amount had been put in it alone. */
  readonly singles: readonly (readonly number[])[];
  readonly basketFinal: number;
  readonly singleFinals: readonly number[];
  readonly beatBasket: number;
  readonly medianSingle: number;
  readonly bestSingle: number;
  readonly worstSingle: number;
  readonly assumptions: readonly string[];
}

/** Made-up model settings, stated to the learner. */
const DRIFT_RANGE = { min: -0.01, max: 0.015 };
const MONTHLY_VOL = 0.08;

const round = (n: number) => Math.round(n * 100) / 100;

export function investingSandbox(input: SandboxInput): Result<SandboxResult, AppError> {
  const { companies, years, startAmount, seed } = input;
  const L = SANDBOX_LIMITS;
  if (!Number.isInteger(companies) || companies < L.companies.min || companies > L.companies.max) return err(validationError(`Use ${L.companies.min} to ${L.companies.max} companies`));
  if (!Number.isInteger(years) || years < L.years.min || years > L.years.max) return err(validationError(`Use ${L.years.min} to ${L.years.max} years`));
  if (!Number.isFinite(startAmount) || startAmount < L.startAmount.min || startAmount > L.startAmount.max) return err(validationError('Enter a starting amount of at least 100'));
  if (!Number.isInteger(seed) || seed < 0) return err(validationError('The seed must be a whole number of 0 or more'));
  const rng = createRng(seed + 7_919);
  const months = years * 12;
  const drifts = Array.from({ length: companies }, () => DRIFT_RANGE.min + rng.next() * (DRIFT_RANGE.max - DRIFT_RANGE.min));
  // Price paths as multiples of the start; a company can fall close to zero but never below.
  const paths = drifts.map((drift) => {
    const path = [1];
    for (let m = 0; m < months; m += 1) {
      const prev = path[m] as number;
      path.push(Math.max(0.001, prev * Math.exp(drift - (MONTHLY_VOL * MONTHLY_VOL) / 2 + MONTHLY_VOL * rng.normal())));
    }
    return path;
  });
  const share = startAmount / companies;
  const basket = Array.from({ length: months + 1 }, (_v, m) => round(paths.reduce((t, p) => t + share * (p[m] as number), 0)));
  const singles = paths.map((p) => p.map((x) => round(startAmount * x)));
  const singleFinals = singles.map((s) => s[months] as number);
  const sorted = [...singleFinals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const basketFinal = basket[months] as number;
  return ok({
    basket,
    singles,
    basketFinal,
    singleFinals,
    beatBasket: singleFinals.filter((v) => v > basketFinal).length,
    medianSingle: round(median),
    bestSingle: sorted[sorted.length - 1] as number,
    worstSingle: sorted[0] as number,
    assumptions: [
      'Simulated: every company and price path is made up by a random model. Nothing here is real market history or a forecast.',
      `Each company gets a random average monthly growth (drift) between ${DRIFT_RANGE.min * 100}% and ${DRIFT_RANGE.max * 100}%, and ups and downs of about ${MONTHLY_VOL * 100}% a month. These are teaching settings, not estimates of any market.`,
      'Buy and hold: the basket starts with an equal amount in every company and is never rebalanced.',
      'No dividends, fees, taxes or inflation are included.',
      'A company can fall close to zero; none is ever dropped, so there is no survivorship bias in the basket.',
    ],
  });
}
