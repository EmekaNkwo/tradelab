import { AppText, Card, CardHeader } from '../ui';
import { ShieldCheck } from '../ui/icons';

interface QualityReportProps {
  readonly report: {
    readonly status: 'ok' | 'warnings' | 'refused';
    readonly rows: number;
    readonly candles: number;
    readonly timeframe: string | null;
    readonly first: string | null;
    readonly last: string | null;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
  };
}

const STATUS = { ok: 'Passed the checks', warnings: 'Passed the checks, with notes', refused: 'Refused: the data failed the checks' } as const;

/** The data-quality report for imported or fetched candles (spec §30): what was checked and what was found. */
export function QualityReport({ report }: QualityReportProps) {
  return (
    <Card>
      <CardHeader icon={ShieldCheck} tone="neutral" title="Data quality" />
      <AppText color={report.status === 'refused' ? 'lossText' : undefined} testID="quality-status">
        {STATUS[report.status]}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {report.status === 'refused'
          ? `${report.rows.toLocaleString('en-US')} rows read.`
          : `${report.candles.toLocaleString('en-US')} candles, ${report.timeframe ?? '?'}, from ${report.first?.slice(0, 16).replace('T', ' ') ?? '?'} to ${report.last?.slice(0, 16).replace('T', ' ') ?? '?'} UTC.`}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        Checked: every row’s date and prices, high and low containing open and close, prices above zero, time order, duplicates, a consistent timeframe, and gaps.
      </AppText>
      {report.errors.map((e) => (
        <AppText key={e} color="lossText" variant="caption">{`• ${e}`}</AppText>
      ))}
      {report.warnings.map((w) => (
        <AppText key={w} variant="caption">{`• ${w}`}</AppText>
      ))}
    </Card>
  );
}
