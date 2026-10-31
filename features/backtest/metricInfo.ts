import { ENGINE_VERSION, RESULT_SCHEMA_VERSION, type BacktestMetrics, type Regime, type SkipReason, type SplitPart, type SplitRule, type TradeStats } from '../../domain/backtest';

/**
 * Labels and plain explanations for every backtest figure (spec §16.3).
 * The order puts risk and robustness before return, and nothing is ranked
 * by profit (spec §16.4).
 */

export interface MetricRow {
  readonly key: keyof BacktestMetrics;
  readonly label: string;
  readonly explain: string;
  readonly format: (m: BacktestMetrics) => string;
}

const usd = (n: number | null) => (n === null ? 'n/a' : `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${n.toFixed(2)}%`);
const num = (n: number | null, places = 2) => (n === null ? 'n/a' : n.toFixed(places));

export const formatUsd = usd;

/** An average result in R, always signed: "+0.123R", "−0.050R", "±0.000R" (a result shows its sign, brief §1). */
export function signedR(n: number, places = 3): string {
  const magnitude = Math.abs(n).toFixed(places);
  const sign = Number(magnitude) === 0 ? '±' : n > 0 ? '+' : '−';
  return `${sign}${magnitude}R`;
}
export const formatPercent = pct;

export const METRIC_ROWS: readonly MetricRow[] = [
  { key: 'trades', label: 'Trades', explain: 'How many trades the rules took. Fewer than 30 is a small sample: the result could be mostly luck.', format: (m) => String(m.trades) },
  { key: 'maxDrawdown', label: 'Maximum drawdown', explain: 'The largest fall from a high point of the account to a later low. This is the pain you would have had to sit through.', format: (m) => pct(m.maxDrawdown) },
  { key: 'averageDrawdown', label: 'Average drawdown', explain: 'How far below its last high the account usually was, over the time it was below one.', format: (m) => pct(m.averageDrawdown) },
  { key: 'expectancyR', label: 'Average result (R)', explain: 'The average trade as a multiple of the amount risked. +0.2R means each trade made a fifth of its risk on average; below 0 means the rules lost money.', format: (m) => (m.expectancyR === null ? 'n/a' : signedR(m.expectancyR)) },
  { key: 'expectancy', label: 'Average result per trade', explain: 'The average profit or loss per trade, in money, after costs.', format: (m) => usd(m.expectancy) },
  { key: 'winRate', label: 'Win rate', explain: 'The share of trades that made money. A low win rate can still be profitable if wins are much bigger than losses, and the reverse.', format: (m) => (m.winRate === null ? 'n/a' : `${(m.winRate * 100).toFixed(1)}%`) },
  { key: 'averageWin', label: 'Average win', explain: 'The average profit of the winning trades.', format: (m) => usd(m.averageWin) },
  { key: 'averageLoss', label: 'Average loss', explain: 'The average loss of the losing trades.', format: (m) => usd(m.averageLoss) },
  { key: 'profitFactor', label: 'Profit factor', explain: 'Total won divided by total lost. Above 1 made money; n/a means there were no losing trades to divide by.', format: (m) => num(m.profitFactor) },
  { key: 'largestGain', label: 'Largest gain', explain: 'The best single trade. If one trade makes most of the profit, the result depends on catching it again.', format: (m) => usd(m.largestGain) },
  { key: 'largestLoss', label: 'Largest loss', explain: 'The worst single trade. Gaps through the stop can make it bigger than the planned risk.', format: (m) => usd(m.largestLoss) },
  { key: 'exposure', label: 'Time in the market', explain: 'The share of candles with a trade open. Money in the market is money at risk.', format: (m) => pct(m.exposure) },
  { key: 'averageHoldingCandles', label: 'Average holding time', explain: 'How many candles a trade usually stayed open.', format: (m) => (m.averageHoldingCandles === null ? 'n/a' : `${m.averageHoldingCandles} candles`) },
  { key: 'turnover', label: 'Turnover', explain: 'The total value of positions opened, as a multiple of the starting capital. High turnover means more costs.', format: (m) => `${num(m.turnover)} ×` },
  { key: 'commissionAndSwap', label: 'Commission and swap', explain: 'Commission and overnight swap paid. The spread and slippage are already in the fill prices.', format: (m) => usd(m.commissionAndSwap) },
  { key: 'netReturn', label: 'Net return', explain: 'The change in the account over the whole test, after costs. On simulated data, so it says nothing about real returns.', format: (m) => pct(m.netReturn) },
  { key: 'finalEquity', label: 'Final equity', explain: 'The simulated account at the end, after closing any open trade.', format: (m) => usd(m.finalEquity) },
];

export const REGIME_LABELS: Readonly<Record<Regime, string>> = {
  trending_up: 'Trending up',
  trending_down: 'Trending down',
  ranging: 'Ranging',
  volatile: 'Volatile',
};

export const SKIP_LABELS: Readonly<Record<SkipReason, string>> = {
  below_minimum_size: 'The risk allowed a size below the market’s minimum',
  not_enough_funds: 'Not enough free margin or cash',
  conflicting_signals: 'Long and short signals on the same candle',
  no_stop_yet: 'The stop could not be worked out yet (not enough candles)',
  invalid_levels: 'The stop or target was on the wrong side of the price',
  outside_session: 'Outside the session hours',
  daily_limit: 'A daily limit was reached',
};

/** One line for a block of trades: count, average R and win rate. No profit ranking. */
export function statsLine(s: TradeStats): string {
  if (s.trades === 0) return 'No trades';
  return `${s.trades} trade${s.trades === 1 ? '' : 's'} · average ${s.expectancyR === null ? 'n/a' : signedR(s.expectancyR)} · win rate ${s.winRate === null ? 'n/a' : `${(s.winRate * 100).toFixed(0)}%`}`;
}

/** Shown on every result: process over profit (spec §16.3, §3). */
export const PROCESS_NOTE =
  'A backtest checks whether rules were followed consistently and what they would have done on this data. It is not a prediction, and simulated profit earns no score or badge here.';

/** Heading for a run's split section. */
export function splitHeading(kind: SplitRule['kind']): string {
  if (kind === 'holdout') return 'In-sample and out-of-sample';
  if (kind === 'walk_forward') return 'Period blocks (no refitting)';
  return 'No split';
}

/** One line per run for the comparison's out-of-sample row. */
export function outOfSampleLine(kind: SplitRule['kind'], split: readonly SplitPart[]): string {
  if (kind === 'walk_forward') return `Period blocks (${split.length})`;
  const oos = split.find((p) => p.label === 'Out-of-sample');
  if (kind === 'holdout' && oos) return `${oos.trades} trades · ${oos.expectancyR === null ? 'n/a' : signedR(oos.expectancyR)}`;
  return 'No out-of-sample test';
}

/** Why a stored run may not match what this app version would produce, or null. */
export function staleRunNote(engineVersion: number, resultSchemaVersion: number): string | null {
  if (resultSchemaVersion < RESULT_SCHEMA_VERSION) {
    return 'This run was saved by an older version of the app. Some details (such as trades left out at split boundaries) were not recorded. Run it again for a full report.';
  }
  if (engineVersion !== ENGINE_VERSION) {
    return `This run was made by backtest engine version ${engineVersion}; this app uses version ${ENGINE_VERSION}, whose fill rules differ. Repeat the run to see the current result.`;
  }
  return null;
}

export const REGIME_NOTE = 'Each trade counts in the regime of the candle it opened on. Regime labels are assigned with hindsight from the whole data set and are used only for this report; the rules never see them.';
