import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { QualityReport } from '../../components/data/QualityReport';
import { AppText, Button, Card, CardHeader, EmptyState, ErrorState, LoadingState, Notice, Screen } from '../../components/ui';
import { ChartCandlestick } from '../../components/ui/icons';
import { storedDatasetLabel, useDatasets, useDeleteDataset } from '../../features/marketData';
import { errorText, type AppError } from '../../shared/errors';
import { MARKET_LABELS } from '../../shared/types';
import { canOpen } from '../../shared/routeAccess';

/** One saved data set: its source, details and quality report, and where it can be used. */
export default function DatasetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const datasets = useDatasets();
  const remove = useDeleteDataset();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  if (datasets.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (datasets.status === 'error') return <Screen><ErrorState error={datasets.error} onRetry={datasets.reload} /></Screen>;
  const d = datasets.data.find((x) => x.id === id);
  if (!d) return <Screen><EmptyState title="Data set not found" body="It may have been deleted." actionLabel="Back" onAction={() => router.back()} /></Screen>;
  const label = storedDatasetLabel(d);
  return (
    <Screen testID="dataset-screen">
      <AppText variant="title" testID="dataset-label">{label}</AppText>
      <Card>
        <AppText>{`${d.name} (${d.symbol}) · ${MARKET_LABELS[d.market]} · ${d.currency ?? 'currency not given'}`}</AppText>
        <AppText variant="caption" color="textSecondary">{`Source: ${d.origin === 'user_import' ? `your file ${d.fileName ?? ''}` : `${d.sourceName}${d.venue ? `, ${d.venue}` : ''} (historical, not live)`}. Saved ${d.createdAt.slice(0, 16).replace('T', ' ')} UTC. Time zone: ${d.timeZone}; candle times are shown in UTC.`}</AppText>
      </Card>
      <QualityReport report={d.quality} />
      <Card>
        <CardHeader icon={ChartCandlestick} title="Use this data" />
        {canOpen('/practice/chart-lab') ? <Button label="Open in Chart Lab" onPress={() => router.push({ pathname: '/practice/chart-lab', params: { datasetId: d.id } })} /> : null}
        {canOpen('/practice/replay') ? <Button label="Replay it" variant="secondary" onPress={() => router.push({ pathname: '/practice/replay', params: { datasetId: d.id } })} /> : null}
        <AppText variant="caption" color="textSecondary">{`For a backtest, build a ${MARKET_LABELS[d.market].toLowerCase()} strategy on the ${d.timeframe} timeframe and choose this data on the run screen.`}</AppText>
      </Card>
      {confirming ? (
        <Notice title="Delete this data?" tone="warning">
          {d.origin === 'user_import' ? 'The imported candles are removed from this phone. Backtests that used them can no longer be repeated.' : 'The saved copy is removed; you can fetch it again later.'}
        </Notice>
      ) : null}
      <Button
        label={confirming ? 'Yes, delete it' : 'Delete'}
        variant="danger"
        onPress={async () => {
          if (!confirming) return setConfirming(true);
          const e = await remove(d.id);
          if (e) return setError(e);
          router.back();
        }}
      />
      {error ? <AppText color="lossText">{errorText(error)}</AppText> : null}
    </Screen>
  );
}
