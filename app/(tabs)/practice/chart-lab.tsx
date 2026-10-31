import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ChartHeader, realDataNote } from '../../../components/chart/ChartHeader';
import { ChartToolTray } from '../../../components/chart/ChartToolTray';
import { PriceChart } from '../../../components/chart/PriceChart';
import { SimulatedNotice } from '../../../components/practice/SimulatedNotice';
import { AppText, Button, Card, CardHeader, ChoiceChips, ErrorState, LoadingState, Notice, Screen, SegmentedControl, TextField } from '../../../components/ui';
import { Layers, Lightbulb, Plus } from '../../../components/ui/icons';
import { storedDatasetLabel, useDataset } from '../../../features/marketData';
import { MissingDataNotice } from '../../../components/data/MissingDataNotice';
import {
  DRAWING_TOOLS,
  OVERLAYS,
  overlayLines,
  presetFromParams,
  type ChartLabParams,
  paneModel,
  PANES,
  SCENARIO_KINDS,
  SCENARIO_LABELS,
  TYPED_TREND_SPAN,
  useChartLab,
  type ChartStyle,
  type DrawingTool,
  type OverlayId,
  type PaneId,
} from '../../../features/practice';

const STYLES = [
  { value: 'hollow', label: 'Hollow candles' },
  { value: 'candles', label: 'Filled candles' },
  { value: 'line', label: 'Line' },
] as const;

const TIMEFRAMES = [
  { value: 'M15', label: '15m' },
  { value: 'H1', label: '1h' },
  { value: 'H4', label: '4h' },
  { value: 'D1', label: '1d' },
] as const;

export default function ChartLabScreen() {
  const params = useLocalSearchParams<ChartLabParams & Record<string, string>>();
  const datasetId = typeof params.datasetId === 'string' && params.datasetId.length > 0 ? params.datasetId : null;
  const data = useDataset(datasetId);
  if (!datasetId) return <ChartLab params={params} real={null} />;
  if (data.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (data.status === 'error') return <Screen><ErrorState error={data.error} onRetry={data.reload} /></Screen>;
  if (!data.data) return <ChartLab params={params} real={null} missingData />;
  const d = data.data;
  return <ChartLab params={params} real={{ label: storedDatasetLabel(d), timeframe: d.timeframe, candles: d.candles }} symbol={d.symbol} origin={d.origin} />;
}

interface ChartLabProps {
  readonly params: ChartLabParams & Record<string, string>;
  readonly real: Parameters<typeof useChartLab>[1];
  readonly missingData?: boolean;
  /** The real data's instrument symbol, for the header's flag pair; generated scenarios have none. */
  readonly symbol?: string;
  readonly origin?: 'user_import' | 'historical';
}

function ChartLab({ params, real, missingData = false, symbol, origin }: ChartLabProps) {
  // Read once: the preset only sets where the lab starts.
  const [preset] = useState(() => presetFromParams(params));
  const lab = useChartLab(preset, real);
  const overlays = useMemo(() => overlayLines(lab.candles, lab.overlays), [lab.candles, lab.overlays]);
  const pane = useMemo(() => paneModel(lab.candles, lab.pane), [lab.candles, lab.pane]);
  const activeTool = DRAWING_TOOLS.find((t) => t.id === lab.drawing.tool);
  return (
    <Screen testID="chart-lab-screen">
      <ChartHeader
        title={lab.real ? (symbol ?? lab.label) : SCENARIO_LABELS[lab.kind]}
        symbol={lab.real ? symbol : undefined}
        timeframe={lab.timeframe}
        badge={lab.real ? undefined : 'simulated'}
        note={lab.real && origin ? realDataNote(origin) : undefined}
        testID="chart-lab-header"
      />
      {missingData ? <MissingDataNotice /> : null}
      {lab.real && lab.window ? (
        <Notice title={lab.label}>
          {`Real past prices from your data, shown as they are. Candles ${lab.window.from.toLocaleString('en-US')}–${lab.window.to.toLocaleString('en-US')} of ${lab.window.total.toLocaleString('en-US')}, ${lab.timeframe}.`}
        </Notice>
      ) : (
        <SimulatedNotice />
      )}
      {preset?.lookFor ? (
        <Card>
          <CardHeader icon={Lightbulb} title="What to look for" />
          <AppText testID="chart-lab-look-for">{preset.lookFor}</AppText>
        </Card>
      ) : null}
      <PriceChart realData={lab.real} candles={lab.candles} style={lab.style} overlays={overlays} pane={pane} drawings={lab.drawing.drawings} onTap={lab.tap} testID="chart-lab-chart" />
      {/* Tool tray (spec §13.1): pick a tool, then tap the chart. */}
      <ChartToolTray
        tools={DRAWING_TOOLS}
        selected={lab.drawing.tool}
        onSelect={lab.selectTool}
        onUndo={lab.undo}
        onClear={lab.clear}
        canUndo={lab.drawing.drawings.length > 0 || lab.drawing.pending !== null}
        canClear={lab.drawing.drawings.length > 0}
        hint={activeTool ? (lab.drawing.pending ? 'Now tap the second point.' : activeTool.hint) : 'Choose a tool, then tap the chart. Long-press the chart to read a candle.'}
        drawingCount={lab.drawing.drawings.length}
      />
      <TypedDrawing lab={lab} />
      <Card>
        <CardHeader icon={Layers} title="Chart settings" />
        <SegmentedControl label="Chart type" options={STYLES} value={lab.style} onChange={(s: ChartStyle) => lab.setStyle(s)} />
        {lab.real ? (
          <>
            <Button label="Earlier candles" variant="secondary" onPress={lab.earlier} disabled={(lab.window?.from ?? 1) <= 1} accessibilityHint={(lab.window?.from ?? 1) <= 1 ? 'Already at the start of the data' : undefined} />
            <Button label="Later candles" variant="secondary" onPress={lab.later} disabled={(lab.window?.to ?? 0) >= (lab.window?.total ?? 0)} accessibilityHint={(lab.window?.to ?? 0) >= (lab.window?.total ?? 0) ? 'Already at the end of the data' : undefined} />
          </>
        ) : (
          <SegmentedControl label="Timeframe" options={TIMEFRAMES} value={lab.timeframe as (typeof TIMEFRAMES)[number]['value']} onChange={lab.setTimeframe} />
        )}
        <ChoiceChips label="On the chart" options={OVERLAYS.map((o) => ({ value: o.id, label: o.label }))} selected={lab.overlays} onChange={(v) => lab.setOverlays(v as OverlayId[])} />
        <ChoiceChips label="Below the chart" single options={PANES.map((p) => ({ value: p.id, label: p.label }))} selected={[lab.pane]} onChange={(v) => lab.setPane((v[0] as PaneId | undefined) ?? lab.pane)} />
        {lab.real ? null : (
          <>
            <ChoiceChips
              label="Scenario"
              single
              options={SCENARIO_KINDS.map((k) => ({ value: k, label: SCENARIO_LABELS[k] }))}
              selected={[lab.kind]}
              onChange={(v) => v[0] && lab.setKind(v[0])}
            />
            <Button label="New chart" variant="secondary" onPress={lab.newChart} />
          </>
        )}
      </Card>
    </Screen>
  );
}

/** The same drawings without precise taps: choose a tool and type the prices. */
function TypedDrawing({ lab }: { readonly lab: ReturnType<typeof useChartLab> }) {
  const [tool, setTool] = useState<DrawingTool>('hline');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const needsTwo = tool !== 'hline';
  const add = () => {
    const error = lab.addTyped(tool, first, second);
    setMessage(error ?? 'Added.');
    if (!error) {
      setFirst('');
      setSecond('');
    }
  };
  return (
    <Card>
      <CardHeader icon={Plus} title="Add a drawing by price" />
      <ChoiceChips label="Drawing to add" single options={DRAWING_TOOLS.map((t) => ({ value: t.id, label: t.label }))} selected={[tool]} onChange={(v) => v[0] && setTool(v[0])} />
      <TextField label={needsTwo ? 'First price' : 'Price'} value={first} onChangeText={setFirst} keyboardType="decimal-pad" testID="typed-first" />
      {needsTwo ? (
        <TextField
          label="Second price"
          value={second}
          onChangeText={setSecond}
          keyboardType="decimal-pad"
          testID="typed-second"
          hint={tool === 'trend' ? `The line runs from ${TYPED_TREND_SPAN} candles ago to the latest candle.` : undefined}
        />
      ) : null}
      <Button label="Add drawing" variant="secondary" onPress={add} />
      {message ? (
        <AppText accessibilityLiveRegion="polite" testID="typed-message">
          {message}
        </AppText>
      ) : null}
    </Card>
  );
}
