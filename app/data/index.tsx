import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card, CardHeader, ChoiceChips, EmptyState, ErrorState, ListRow, ListScreen, LoadingState, Notice, Screen, SectionHeader, SegmentedControl, TextField } from '../../components/ui';
import { ChartCandlestick, ChartLine, Database } from '../../components/ui/icons';
import { PROVIDER_CACHE_HOURS, storedDatasetLabel, useDatasets, useProviderFetch, type ProviderForm } from '../../features/marketData';
import { useSettings } from '../../features/settings';
import { errorText } from '../../shared/errors';
import { formatInTimeZone } from '../../shared/time';
import { MARKET_KINDS, MARKET_LABELS, type MarketKind } from '../../shared/types';
import { canOpen } from '../../shared/routeAccess';

const TIMEFRAMES = [
  { value: 'M15', label: '15m' },
  { value: 'H1', label: '1h' },
  { value: 'H4', label: '4h' },
  { value: 'D1', label: '1d' },
] as const;

const COUNTS = [500, 1000, 2000, 5000] as const;

/** The learner's own price data (spec §30): imported files and optional provider data, each labelled with its source. */
export default function DataScreen() {
  const datasets = useDatasets();
  const settings = useSettings();
  if (datasets.status === 'loading' || settings.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (datasets.status === 'error') return <Screen><ErrorState error={datasets.error} onRetry={datasets.reload} /></Screen>;
  return (
    <ListScreen
      testID="data-screen"
      header={
        <>
          <AppText variant="title">Your price data</AppText>
          <Notice title="Real data, used as it is">
            Data here comes from a file you chose or from a provider you set up. It is labelled with its source on every chart, replay and backtest, and never mixed with simulated data. Past prices do not show what will happen next.
          </Notice>
          <Card>
            <CardHeader icon={Database} title="Import a CSV file" />
            <AppText color="textSecondary">A file with a header line naming date (or time), open, high, low, close and, if you have it, volume. Every row is checked before anything is saved.</AppText>
            <Button label="Choose a CSV file" onPress={() => router.push('/data/import')} />
          </Card>
          {settings.status === 'success' && settings.data.integrations.marketProvider ? (
            <FetchCard timeZone={settings.data.timeZone} />
          ) : (
            <Card>
              <CardHeader icon={ChartLine} tone="info" title="Fetch from Twelve Data" />
              <AppText color="textSecondary">Optional, with your own key, and needs the internet. It is off now.</AppText>
              {canOpen('/more/services') ? <Button label="Set up in Data and AI services" variant="secondary" onPress={() => router.push('/more/services')} /> : null}
            </Card>
          )}
          <SectionHeader title="Saved data" />
        </>
      }
      data={datasets.data}
      keyExtractor={(d) => d.id}
      renderItem={(d) => (
        <ListRow
          testID={`dataset-${d.id}`}
          icon={ChartCandlestick}
          title={storedDatasetLabel(d)}
          subtitle={`${d.symbol} · ${d.timeframe} · ${d.candleCount.toLocaleString('en-US')} candles · ${d.first.slice(0, 10)} to ${d.last.slice(0, 10)}`}
          onPress={() => router.push({ pathname: '/data/[id]', params: { id: d.id } })}
        />
      )}
      empty={<EmptyState title="No price data yet" body="Import a file or fetch data to use it in Chart Lab, replay and backtests. Simulated data is always available without it." />}
    />
  );
}

function FetchCard({ timeZone }: { readonly timeZone: string }) {
  const { state, start, cancel } = useProviderFetch();
  const [form, setForm] = useState<ProviderForm>({ symbol: '', name: '', market: 'forex', timeframe: 'H1', candles: 1000 });
  const fetching = state.status === 'fetching';
  return (
    <Card>
      <CardHeader icon={ChartLine} tone="info" title="Fetch from Twelve Data" />
      <AppText variant="caption" color="textSecondary">{`Historical candles, not live prices. The same request within ${PROVIDER_CACHE_HOURS} hours reuses the saved copy, so it does not use up your plan’s requests.`}</AppText>
      <TextField label="Symbol" value={form.symbol} onChangeText={(symbol) => setForm({ ...form, symbol })} autoCapitalize="characters" placeholder="EUR/USD, XAU/USD, AAPL" testID="fetch-symbol" />
      <TextField label="Name (optional)" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
      <ChoiceChips label="Market" single options={MARKET_KINDS.map((m) => ({ value: m, label: MARKET_LABELS[m] }))} selected={[form.market]} onChange={(v) => v[0] && setForm({ ...form, market: v[0] as MarketKind })} />
      <SegmentedControl label="Timeframe" options={TIMEFRAMES} value={form.timeframe as (typeof TIMEFRAMES)[number]['value']} onChange={(timeframe) => setForm({ ...form, timeframe })} />
      <ChoiceChips label="Candles" single options={COUNTS.map((n) => ({ value: n, label: n.toLocaleString('en-US') }))} selected={[form.candles]} onChange={(v) => v[0] && setForm({ ...form, candles: v[0] })} />
      {fetching ? (
        <>
          <AppText accessibilityLiveRegion="polite">Fetching…</AppText>
          <Button label="Cancel" variant="secondary" onPress={cancel} />
        </>
      ) : (
        <Button label="Fetch data" onPress={() => void start(form)} disabled={form.symbol.trim() === ''} disabledReason="Enter a symbol first." />
      )}
      {state.status === 'error' ? <AppText color="lossText" testID="fetch-error">{errorText(state.error)}</AppText> : null}
      {state.status === 'done' ? (
        <Notice live title={state.outcome.fromCache ? 'Already saved' : 'Saved'} tone="success">
          <AppText testID="fetch-outcome">{`${storedDatasetLabel(state.outcome.dataset)}: ${state.outcome.dataset.candleCount.toLocaleString('en-US')} candles.${state.outcome.fromCache ? ` This is the copy fetched ${formatInTimeZone(state.outcome.fetchedAt, timeZone)}; choose Fetch again for a new copy.` : ''}`}</AppText>
          {state.outcome.fromCache ? <Button label="Fetch again" variant="secondary" onPress={() => void start(form, true)} /> : null}
        </Notice>
      ) : null}
    </Card>
  );
}
