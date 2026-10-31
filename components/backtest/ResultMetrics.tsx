import { View } from 'react-native';
import { formatPercent, formatUsd, METRIC_ROWS, type MetricRow } from '../../features/backtest';
import { useTheme } from '../../theme';
import type { Direction } from '../ui/valueParts';
import { AppText } from '../ui/AppText';
import { Card, cardSurface } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { ChartColumn, ChartLine } from '../ui/icons';
import { MoneyText } from '../ui/MoneyText';
import { StatTile } from '../ui/StatTile';
import { LineChart } from './LineChart';
import { HEADLINE_KEYS, metricKind, rDirection } from './metricDisplay';
import { RValue } from './RValue';
import { MetricValue } from './MetricValue';

type Metrics = Parameters<MetricRow['format']>[0];

const HEADLINE_ROWS = HEADLINE_KEYS.flatMap((k) => METRIC_ROWS.filter((r) => r.key === k));

/** The report's Results card: four headline tiles, then every metric with its plain explanation (spec §16.3). */
export function ResultMetrics({ metrics }: { readonly metrics: Metrics }) {
  const { spacing } = useTheme();
  return (
    <Card testID="result-metrics">
      <CardHeader icon={ChartColumn} title="Results" badge="backtest" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {HEADLINE_ROWS.map((row) => {
          const value = row.format(metrics);
          const direction = metricKind(row.key) === 'r' ? rDirection(metrics, row.key) : null;
          if (direction) return <RTile key={row.key} caption={row.label} direction={direction} text={value} testID={`headline-${row.key}`} />;
          return <StatTile key={row.key} caption={row.label} value={value} accessibilityLabel={`${row.label}, backtest, ${value === 'n/a' ? 'not available' : value}`} testID={`headline-${row.key}`} />;
        })}
      </View>
      {METRIC_ROWS.map((row) => (
        <View key={row.key} testID={`metric-${row.key}`} style={{ gap: spacing.xxs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <AppText variant="label" accessibilityElementsHidden importantForAccessibility="no">
              {row.label}
            </AppText>
            <MetricValue row={row} metrics={metrics} />
          </View>
          <AppText variant="caption" color="textSecondary">
            {row.explain}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

interface RTileProps {
  readonly caption: string;
  readonly direction: Direction;
  readonly text: string;
  readonly testID?: string;
}

/** A headline tile for the average result in R: signed, with the result arrow and colours (not money). */
function RTile({ caption, direction, text, testID }: RTileProps) {
  const theme = useTheme();
  const { spacing } = theme;
  return (
    <View testID={testID} style={[cardSurface(theme, 'tile'), { padding: spacing.md, gap: spacing.xs, flexGrow: 1, flexBasis: 140 }]}>
      <AppText variant="caption" color="textSecondary" accessibilityElementsHidden importantForAccessibility="no">
        {caption}
      </AppText>
      <RValue direction={direction} text={text} subject={`${caption}, backtest`} variant="title" />
    </View>
  );
}

interface ResultCurvesProps {
  readonly equity: readonly number[];
  readonly drawdown: readonly number[];
  readonly startingCapital: number;
  readonly finalEquity: number;
  readonly maxDrawdown: number | null;
}

/** Equity (neutral ink, never brand) and drawdown (loss) curves, under the Backtest badge. */
export function ResultCurves({ equity, drawdown, startingCapital, finalEquity, maxDrawdown }: ResultCurvesProps) {
  const from = formatUsd(startingCapital);
  const to = formatUsd(finalEquity);
  return (
    <Card testID="result-curves">
      <CardHeader icon={ChartLine} title="Equity and drawdown" badge="backtest" />
      <LineChart
        title="Equity"
        values={equity}
        summary={`From ${from} to ${to} (simulated)`}
        summaryContent={
          <AppText variant="caption" color="textSecondary">
            {'From '}
            <MoneyText variant="caption" color="textSecondary">
              {from}
            </MoneyText>
            {' to '}
            <MoneyText variant="caption" color="textSecondary">
              {to}
            </MoneyText>
            {' (simulated)'}
          </AppText>
        }
        testID="equity-curve"
      />
      <LineChart title="Drawdown" values={drawdown} inverted tone="loss" summary={`Deepest fall from a high: ${formatPercent(maxDrawdown)}`} testID="drawdown-curve" />
    </Card>
  );
}
