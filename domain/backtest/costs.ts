import { dec, isTypedNumber } from '../../shared/decimal';
import type { PracticeInstrument } from '../simulation/instruments';

/**
 * Trading costs for a backtest (spec §16.3), as decimal text so runs can be
 * stored and hashed exactly. They start at the practice instrument's example
 * terms and the learner can change them; zero costs are allowed but flagged.
 */
export interface BacktestCosts {
  /** Full bid–ask spread, in price units. */
  readonly spread: string;
  /** Extra price paid on market and stop fills. */
  readonly slippage: string;
  /** Per size unit, charged on entry and on exit. */
  readonly commissionPerSide: string;
  /** Financing per size unit for each new UTC day a position is held (negative is a charge). */
  readonly swapLong: string;
  readonly swapShort: string;
}

export function defaultCosts(i: PracticeInstrument): BacktestCosts {
  return {
    spread: i.spread.toString(),
    slippage: i.slippage.toString(),
    commissionPerSide: i.commissionPerSide.toString(),
    swapLong: i.swapLong.toString(),
    swapShort: i.swapShort.toString(),
  };
}

export function costIssues(c: BacktestCosts): readonly { readonly field: keyof BacktestCosts; readonly message: string }[] {
  const issues: { field: keyof BacktestCosts; message: string }[] = [];
  for (const field of ['spread', 'slippage', 'commissionPerSide'] as const) {
    if (!isTypedNumber(c[field]) || dec(c[field]).isNegative()) issues.push({ field, message: 'Enter a number of 0 or more' });
  }
  for (const field of ['swapLong', 'swapShort'] as const) {
    if (!isTypedNumber(c[field])) issues.push({ field, message: 'Enter a number (negative is a charge)' });
  }
  return issues;
}

/** True when the run would ignore a cost a real account pays. */
export const missingCosts = (c: BacktestCosts): boolean => dec(c.spread).isZero() || (dec(c.commissionPerSide).isZero() && dec(c.slippage).isZero());

/** The instrument with these costs, for the shared fill rules. The original is never changed. */
export function withCosts(i: PracticeInstrument, c: BacktestCosts): PracticeInstrument {
  return {
    ...i,
    spread: dec(c.spread),
    slippage: dec(c.slippage),
    commissionPerSide: dec(c.commissionPerSide),
    swapLong: dec(c.swapLong),
    swapShort: dec(c.swapShort),
  };
}
