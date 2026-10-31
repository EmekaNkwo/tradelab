import { dec, type Decimal } from '../../shared/decimal';
import { createRng } from '../market/random';

/**
 * Risk education calculators (spec §19). These are arithmetic on the
 * learner's own inputs, not statistics about real traders. Simulations use a
 * fixed seed so the same inputs always give the same answer.
 */

/** Win rate needed to break even at a reward:risk ratio, before costs: 1 ÷ (1 + R). */
export function breakEvenWinRate(rewardToRisk: Decimal): Decimal | null {
  return rewardToRisk.gt(0) ? dec(1).div(dec(1).plus(rewardToRisk)) : null;
}

/** Expected result per trade, in R: win rate × average win − loss rate × average loss. */
export function expectancyR(winRate: Decimal, avgWinR: Decimal, avgLossR: Decimal): Decimal {
  return winRate.times(avgWinR).minus(dec(1).minus(winRate).times(avgLossR));
}

/** Gain needed to get back to the peak after a drawdown: d ÷ (1 − d). Null at 100%. */
export function recoveryNeeded(drawdown: Decimal): Decimal | null {
  return drawdown.gte(1) || drawdown.isNegative() ? null : drawdown.div(dec(1).minus(drawdown));
}

/** Balance after compounding a fixed rate per period. */
export function compound(start: Decimal, ratePerPeriod: Decimal, periods: number): Decimal {
  return start.times(dec(1).plus(ratePerPeriod).pow(periods));
}

/**
 * Chance of at least one run of `streak` losses in a row within `trades`
 * trades, when each trade loses independently with probability `lossRate`.
 * Exact, by tracking the current run length.
 */
export function chanceOfLosingStreak(lossRate: number, trades: number, streak: number): number {
  if (streak <= 0) return 1;
  if (trades < streak || lossRate <= 0) return 0;
  // state[k] = chance the current losing run has length k and no full streak has happened yet.
  let state: number[] = Array.from({ length: streak }, (_, k) => (k === 0 ? 1 : 0));
  let hit = 0;
  for (let t = 0; t < trades; t += 1) {
    const next = Array.from({ length: streak }, () => 0);
    for (let k = 0; k < streak; k += 1) {
      const p = state[k] as number;
      next[0] = (next[0] as number) + p * (1 - lossRate);
      if (k + 1 === streak) hit += p * lossRate;
      else next[k + 1] = (next[k + 1] as number) + p * lossRate;
    }
    state = next;
  }
  return hit;
}

export interface RuinInput {
  readonly winRate: number;
  readonly rewardToRisk: number;
  /** Risk per trade, as a fraction of current equity (0.01 = 1%). */
  readonly riskFraction: number;
  /** Equity drop, from the start, counted as ruin (0.5 = losing half). */
  readonly ruinDrawdown: number;
  readonly trades: number;
  readonly runs?: number;
  readonly seed?: number;
}

/**
 * Share of simulated runs that hit the ruin level. Monte Carlo with a fixed
 * seed; an illustration of how risk size changes the odds, not a forecast.
 */
export function simulateRuin(input: RuinInput): number {
  const runs = input.runs ?? 2000;
  const rng = createRng(input.seed ?? 1);
  const floor = 1 - input.ruinDrawdown;
  let ruined = 0;
  for (let r = 0; r < runs; r += 1) {
    let equity = 1;
    for (let t = 0; t < input.trades; t += 1) {
      const stake = equity * input.riskFraction;
      equity += rng.next() < input.winRate ? stake * input.rewardToRisk : -stake;
      if (equity <= floor) {
        ruined += 1;
        break;
      }
    }
  }
  return ruined / runs;
}
