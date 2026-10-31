import { dec, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';

/**
 * Full position sizing (spec §19). Everything is Decimal. Costs are included,
 * so the size keeps the loss at the stop, after costs, within the budget.
 * Missing specifications are not guessed: the caller must supply them, and
 * every convention used is listed in `assumptions`.
 */

export interface InstrumentSpec {
  /** Units of the instrument per lot (100,000 for a standard forex lot). */
  readonly contractSize: Decimal;
  /** Price step that counts as one pip (or tick). */
  readonly pipSize: Decimal;
  /** Smallest size step and smallest size, in lots. */
  readonly lotStep: Decimal;
  readonly minLot: Decimal;
}

export interface TradingCosts {
  /** Spread paid on entry, in pips. */
  readonly spreadPips: Decimal;
  /** Round-trip commission per lot, in the account currency. */
  readonly commissionPerLot: Decimal;
}

export interface SizingInput {
  readonly balance: Decimal;
  readonly riskPercent: Decimal;
  readonly side: 'buy' | 'sell';
  readonly entry: Decimal;
  readonly stop: Decimal;
  readonly target: Decimal | null;
  readonly spec: InstrumentSpec;
  /** Account-currency value of one unit of the quote currency (1 when the account is in the quote currency). */
  readonly quoteToAccount: Decimal;
  readonly costs: TradingCosts;
}

export interface SizingResult {
  readonly moneyAtRisk: Decimal;
  readonly stopDistancePips: Decimal;
  readonly lots: Decimal;
  readonly belowMinimum: boolean;
  /** Loss at the stop from price movement alone. */
  readonly grossLossAtStop: Decimal;
  /** Loss at the stop including spread and commission. */
  readonly netLossAtStop: Decimal;
  readonly netProfitAtTarget: Decimal | null;
  /** Reward ÷ risk by price distance (before costs); null without a target. */
  readonly rewardToRisk: Decimal | null;
  readonly assumptions: readonly string[];
}

function positive(value: Decimal, label: string): AppError | null {
  return value.isFinite() && value.gt(0) ? null : validationError(`${label} must be more than zero`, { issues: [label] });
}

export function sizePosition(input: SizingInput): Result<SizingResult, AppError> {
  const { balance, riskPercent, side, entry, stop, target, spec, quoteToAccount, costs } = input;
  const problems = [
    positive(balance, 'balance'),
    positive(riskPercent, 'riskPercent'),
    positive(entry, 'entry'),
    positive(stop, 'stop'),
    positive(spec.contractSize, 'contractSize'),
    positive(spec.pipSize, 'pipSize'),
    positive(spec.lotStep, 'lotStep'),
    positive(quoteToAccount, 'quoteToAccount'),
  ].filter((p): p is AppError => p !== null);
  if (problems[0]) return err(problems[0]);
  if (riskPercent.gt(100)) return err(validationError('Risk cannot be more than 100% of the balance', { issues: ['riskPercent'] }));
  if (costs.spreadPips.isNegative() || costs.commissionPerLot.isNegative()) return err(validationError('Costs cannot be negative', { issues: ['costs'] }));
  const buy = side === 'buy';
  if (buy ? stop.gte(entry) : stop.lte(entry)) {
    return err(validationError(`For a ${side} the stop must be ${buy ? 'below' : 'above'} the entry`, { issues: ['stop'] }));
  }
  if (target && (buy ? target.lte(entry) : target.gte(entry))) {
    return err(validationError(`For a ${side} the target must be ${buy ? 'above' : 'below'} the entry`, { issues: ['target'] }));
  }

  const moneyAtRisk = balance.times(riskPercent).div(100);
  const distance = entry.minus(stop).abs();
  const pipValuePerLot = spec.contractSize.times(spec.pipSize).times(quoteToAccount);
  const stopDistancePips = distance.div(spec.pipSize);
  const costPerLot = costs.spreadPips.times(pipValuePerLot).plus(costs.commissionPerLot);
  const lossPerLot = stopDistancePips.times(pipValuePerLot).plus(costPerLot);
  const exact = moneyAtRisk.div(lossPerLot);
  const stepped = exact.div(spec.lotStep).floor().times(spec.lotStep);
  const belowMinimum = stepped.lt(spec.minLot);
  const lots = belowMinimum ? dec(0) : stepped;
  const grossLossAtStop = stopDistancePips.times(pipValuePerLot).times(lots);
  const netLossAtStop = lossPerLot.times(lots);
  const reward = target ? target.minus(entry).abs() : null;
  const netProfitAtTarget = reward ? reward.div(spec.pipSize).times(pipValuePerLot).minus(costPerLot).times(lots) : null;

  return ok({
    moneyAtRisk,
    stopDistancePips,
    lots,
    belowMinimum,
    grossLossAtStop,
    netLossAtStop,
    netProfitAtTarget,
    rewardToRisk: reward ? reward.div(distance) : null,
    assumptions: [
      `${spec.contractSize.toString()} units per lot; one pip is ${spec.pipSize.toString()}.`,
      `Size is rounded down to steps of ${spec.lotStep.toString()} lots; the smallest size is ${spec.minLot.toString()} lots.`,
      `Costs: ${costs.spreadPips.toString()} pips of spread and ${costs.commissionPerLot.toString()} commission per lot, round trip.`,
      quoteToAccount.eq(1) ? 'The account is in the quote currency, so no conversion is needed.' : `One unit of the quote currency is worth ${quoteToAccount.toString()} in the account currency.`,
      'A gap or slippage can make the real loss larger than the loss at the stop.',
    ],
  });
}
