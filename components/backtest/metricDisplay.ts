import type { MetricRow } from '../../features/backtest';
import { directionOf, type Direction } from '../ui/valueParts';

type Metrics = Parameters<MetricRow['format']>[0];
type MetricKey = MetricRow['key'];

/**
 * How a backtest figure is drawn (restyle brief §5.5). Results of trades are P/L (PnLValue: sign, arrow, gain/loss
 * colour); other money is marked plain money; the rest is text. Presentation only: the values and their formatting
 * come from METRIC_ROWS and the run's own metrics.
 */
export type MetricKind = 'pnl' | 'money' | 'r' | 'plain';

const PNL: ReadonlySet<MetricKey> = new Set<MetricKey>(['expectancy', 'averageWin', 'averageLoss', 'largestGain', 'largestLoss']);
const MONEY: ReadonlySet<MetricKey> = new Set<MetricKey>(['commissionAndSwap', 'finalEquity']);

export function metricKind(key: MetricKey): MetricKind {
  if (PNL.has(key)) return 'pnl';
  if (MONEY.has(key)) return 'money';
  if (key === 'expectancyR') return 'r';
  return 'plain';
}

export interface PnLParts {
  readonly direction: Direction;
  /** The amount without its sign, as METRIC_ROWS formats it: "42.50 USD". */
  readonly amount: string;
}

/** A P/L figure split for PnLValue, or null when the run has no value for it (shown as "n/a"). */
export function pnlParts(m: Metrics, key: MetricKey, format: (n: number | null) => string): PnLParts | null {
  const raw = m[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return { direction: directionOf(raw, 2), amount: format(Math.abs(raw)) };
}

/** The direction of an R result as shown (3 decimals), or null when the run has none. */
export function rDirection(m: Metrics, key: MetricKey): Direction | null {
  const raw = m[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? directionOf(raw, 3) : null;
}

/** The headline tiles: the four the brief names, when the result computes them (always, in this engine). */
export const HEADLINE_KEYS: readonly MetricKey[] = ['expectancyR', 'profitFactor', 'maxDrawdown', 'winRate'];
