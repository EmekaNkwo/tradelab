import { dec, type Decimal } from '../../shared/decimal';
import type { ClosedTrade } from './replay';

/**
 * Process feedback for a finished replay (spec §13.2 "rubric feedback").
 * It judges how each trade was managed (a stop from the start, risk within
 * the learner's limit), never whether it made money: a well-managed loss
 * scores full marks and an unplanned win does not.
 */

export interface TradeReview {
  readonly index: number;
  readonly hadStop: boolean;
  /** Planned risk at entry as a percentage of the balance before the trade; null without a stop. */
  readonly riskPercent: Decimal | null;
  readonly withinLimit: boolean;
  readonly lines: readonly string[];
}

export interface ReplayReview {
  readonly trades: readonly TradeReview[];
  readonly netResult: Decimal;
  /** Share of trades that had a stop and stayed within the risk limit; null with no trades. */
  readonly processScore: number | null;
  readonly summary: readonly string[];
}

const REASONS: Readonly<Record<ClosedTrade['reason'], string>> = {
  stop_loss: 'closed by its stop loss',
  take_profit: 'closed by its take profit',
  manual: 'closed by you',
  end_of_data: 'closed when the replay ended',
};

const signed = (d: Decimal) => `${d.isNegative() ? '' : '+'}${d.toFixed(2)}`;

/** Partial closes of one trade share `openedAt`; they are reviewed as one trade. */
function groupTrades(trades: readonly ClosedTrade[]): readonly (readonly ClosedTrade[])[] {
  const groups = new Map<number, ClosedTrade[]>();
  for (const t of trades) groups.set(t.openedAt, [...(groups.get(t.openedAt) ?? []), t]);
  return [...groups.values()];
}

export function reviewReplay(trades: readonly ClosedTrade[], startingBalance: Decimal, riskLimitPercent: Decimal = dec(2), stepBacks = 0): ReplayReview {
  let balance = startingBalance;
  const reviews: TradeReview[] = [];
  groupTrades(trades).forEach((parts, i) => {
    const first = parts[0] as ClosedTrade;
    const units = parts.reduce((n, p) => n.plus(p.units), dec(0));
    const profit = parts.reduce((n, p) => n.plus(p.profit), dec(0));
    const stop = first.initialStop;
    const riskPercent = stop && balance.gt(0) ? first.entry.minus(stop).abs().times(units).div(balance).times(100) : null;
    const withinLimit = riskPercent !== null && riskPercent.lte(riskLimitPercent);
    const last = parts[parts.length - 1] as ClosedTrade;
    const lines = [
      `Trade ${i + 1}: ${first.side} at ${first.entry.toString()}, ${parts.length > 1 ? 'closed in parts, last ' : ''}${REASONS[last.reason]}. Result ${signed(profit)}.`,
      stop === null
        ? 'No stop loss when it opened, so the risk was not defined. Decide where the idea is wrong before you enter.'
        : riskPercent === null
          ? 'The balance was used up before this trade, so its risk cannot be measured as a share of the account.'
        : withinLimit
          ? `Planned risk was ${riskPercent.toFixed(2)}% of the balance, within the ${riskLimitPercent.toString()}% practice limit.`
          : `Planned risk was ${riskPercent.toFixed(2)}% of the balance, above the ${riskLimitPercent.toString()}% practice limit. Use a smaller size for the same stop.`,
    ];
    reviews.push({ index: i + 1, hadStop: stop !== null, riskPercent, withinLimit, lines });
    balance = balance.plus(profit);
  });
  const netResult = trades.reduce((n, t) => n.plus(t.profit), dec(0));
  const good = reviews.filter((r) => r.withinLimit).length;
  const processScore = reviews.length === 0 ? null : good / reviews.length;
  const summary =
    reviews.length === 0
      ? ['No trades were taken. Skipping is a valid decision when no setup fits your plan.']
      : [
          `${good} of ${reviews.length} trades had a stop from the start and stayed within the practice risk limit.`,
          `Net result ${signed(netResult)}. The score above is about process: one replay is too short to judge a method by its result.`,
        ];
  const hindsight =
    stepBacks > 0
      ? [`You stepped back ${stepBacks} time${stepBacks === 1 ? '' : 's'}. That is fine for study, but live markets have no undo, so treat this result as reached with a second look.`]
      : [];
  return { trades: reviews, netResult, processScore, summary: [...summary, ...hindsight] };
}
