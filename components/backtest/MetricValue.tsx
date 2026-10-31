import { formatUsd, type MetricRow } from '../../features/backtest';
import { AppText } from '../ui/AppText';
import { MoneyText } from '../ui/MoneyText';
import { PnLValue } from '../ui/PnLValue';
import { spokenAmount } from '../ui/valueParts';
import { metricKind, pnlParts, rDirection } from './metricDisplay';
import { RValue } from './RValue';

type Metrics = Parameters<MetricRow['format']>[0];

interface MetricValueProps {
  readonly row: MetricRow;
  readonly metrics: Metrics;
  /** Said before the value, e.g. "Run 2". */
  readonly prefix?: string;
  readonly testID?: string;
}

/**
 * One backtest figure in its kind (metricDisplay.ts): P/L as PnLValue, other money as MoneyText, the rest as
 * tabular text. Must sit in a card with the "Backtest · Simulated" badge.
 */
export function MetricValue({ row, metrics, prefix, testID }: MetricValueProps) {
  const kind = metricKind(row.key);
  const subject = `${prefix ? `${prefix}, ` : ''}${row.label}, backtest`;
  if (kind === 'pnl') {
    const parts = pnlParts(metrics, row.key, formatUsd);
    if (parts) return <PnLValue direction={parts.direction} amount={parts.amount} subject={subject} testID={testID} />;
  }
  const text = row.format(metrics);
  const rDir = kind === 'r' ? rDirection(metrics, row.key) : null;
  if (rDir) return <RValue direction={rDir} text={text} subject={subject} testID={testID} />;
  if (kind === 'money' && text !== 'n/a') {
    return (
      <MoneyText testID={testID} accessibilityLabel={`${subject}, ${spokenAmount(text)}`}>
        {text}
      </MoneyText>
    );
  }
  return (
    <AppText testID={testID} tabular accessibilityLabel={`${subject}, ${text === 'n/a' ? 'not available' : text}`}>
      {text}
    </AppText>
  );
}
