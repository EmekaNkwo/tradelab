import { errorText } from '../../../shared/errors';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { ChartHeader } from '../../../components/chart/ChartHeader';
import { PriceChart } from '../../../components/chart/PriceChart';
import { OrderTicket } from '../../../components/practice/OrderTicket';
import { ReplayControls } from '../../../components/practice/ReplayControls';
import { SimulatedNotice } from '../../../components/practice/SimulatedNotice';
import { AppText, Button, Card, CardHeader, ChoiceChips, ErrorState, LoadingState, Notice, PnLValue, Screen, SegmentedControl, StatTile, TextField, useReduceMotion } from '../../../components/ui';
import { ChartCandlestick, ChartColumn, ClipboardList, Clock, ListChecks, Target } from '../../../components/ui/icons';
import { directionOf } from '../../../components/ui/valueParts';
import { moneyMagnitude, moneyText, spokenMoney } from '../../../features/paper';
import { useTheme } from '../../../theme';
import { MissingDataNotice } from '../../../components/data/MissingDataNotice';
import { storedDatasetLabel, useDataset, usePriceFit, type StoredDataset } from '../../../features/marketData';
import {
  MAX_REPLAY_NOTE_LENGTH,
  REPLAY_BALANCES,
  REPLAY_RISK_LIMIT_PERCENT,
  REPLAY_SPEEDS,
  MIN_REAL_REPLAY_CANDLES,
  SCENARIO_KINDS,
  SCENARIO_LABELS,
  simulatedTime,
  realTime,
  toChartCandles,
  useReplay,
  useSeedMaker,
  type LevelLine,
  type ReplaySetup,
  type ReplayView,
  type ScenarioKind,
} from '../../../features/practice';

const SLOWEST_SPEED_MS = Math.max(...REPLAY_SPEEDS.map((s) => s.ms));

const TIMEFRAMES = [
  { value: 'M15', label: '15m' },
  { value: 'H1', label: '1h' },
  { value: 'H4', label: '4h' },
  { value: 'D1', label: '1d' },
] as const;

export default function ReplayScreen() {
  // A strategy page can suggest a scenario; an unknown value falls back to the default.
  const { scenario, datasetId } = useLocalSearchParams<{ scenario?: string; datasetId?: string }>();
  const suggested = SCENARIO_KINDS.find((k) => k === scenario) ?? 'breakout';
  const data = useDataset(datasetId ? datasetId : null);
  const [setup, setSetup] = useState<ReplaySetup | null>(null);
  if (setup) return <ReplayRunner key={`${setup.kind}-${setup.seed}`} setup={setup} onNew={() => setSetup(null)} />;
  if (!datasetId) return <ReplaySetupForm initialKind={suggested} onStart={setSetup} />;
  if (data.status === 'loading') return <Screen><LoadingState /></Screen>;
  if (data.status === 'error') return <Screen><ErrorState error={data.error} onRetry={data.reload} /></Screen>;
  return data.data ? <RealReplaySetup dataset={data.data} onStart={setSetup} /> : <ReplaySetupForm initialKind={suggested} onStart={setSetup} missingData />;
}

/** Replay the learner's own forex data. Sizes are in forex lots, so other markets are not offered. */
function RealReplaySetup({ dataset, onStart }: { readonly dataset: StoredDataset; readonly onStart: (s: ReplaySetup) => void }) {
  const newSeed = useSeedMaker();
  const [balance, setBalance] = useState(REPLAY_BALANCES[1] ?? '5000');
  const label = storedDatasetLabel(dataset);
  const usable = dataset.market === 'forex' && dataset.candles.length >= MIN_REAL_REPLAY_CANDLES;
  // Replay sizes and costs trades with the practice forex market's terms.
  const fit = usePriceFit(dataset.candles, 'sim-eurusd');
  return (
    <Screen testID="replay-setup">
      <AppText variant="title">Replay your data</AppText>
      <Notice title={label}>Real past prices from your data. The replay starts somewhere part-way through, and you only see candles that have closed. Trades and the balance are simulated.</Notice>
      <FillRules />
      {usable && fit && !fit.fits ? (
        <Notice title="The practice costs do not fit this market" tone="warning">
          <AppText testID="price-fit-warning">{fit.warning ?? ''}</AppText>
        </Notice>
      ) : null}
      {usable ? (
        <Card>
          <ChoiceChips label="Starting balance (USD, simulated)" single options={REPLAY_BALANCES.map((b) => ({ value: b, label: b }))} selected={[balance]} onChange={(v) => v[0] && setBalance(v[0])} />
          <AppText variant="caption" color="textSecondary">Replays of real data are reviewed when you finish but not saved to your progress, because their market condition is not labelled.</AppText>
          <Button label="Start replay" onPress={() => onStart({ kind: 'range', timeframe: dataset.timeframe, balance, seed: newSeed(), data: { datasetId: dataset.id, label, candles: dataset.candles } })} />
        </Card>
      ) : (
        <Notice title="This data cannot be replayed" tone="warning">
          {dataset.market !== 'forex' ? 'Replay sizes trades in forex lots, so it is offered for forex data only. Use Chart Lab or a backtest for this data.' : `Replay needs at least ${MIN_REAL_REPLAY_CANDLES} candles.`}
        </Notice>
      )}
    </Screen>
  );
}

function ReplaySetupForm({ initialKind, onStart, missingData = false }: { readonly initialKind: ScenarioKind; readonly onStart: (s: ReplaySetup) => void; readonly missingData?: boolean }) {
  const newSeed = useSeedMaker();
  const [kind, setKind] = useState<ScenarioKind>(initialKind);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]['value']>('H1');
  const [balance, setBalance] = useState(REPLAY_BALANCES[1] ?? '5000');
  return (
    <Screen testID="replay-setup">
      <AppText variant="title">Set up a replay</AppText>
      {missingData ? <MissingDataNotice /> : null}
      <AppText color="textSecondary">The chart starts part-way through. You only ever see candles that have already closed; reveal the next one when you are ready.</AppText>
      <SimulatedNotice />
      <FillRules />
      <Card>
        <CardHeader icon={ChartCandlestick} title="Your replay" badge="replay" />
        <ChoiceChips label="Scenario" single options={SCENARIO_KINDS.map((k) => ({ value: k, label: SCENARIO_LABELS[k] }))} selected={[kind]} onChange={(v) => v[0] && setKind(v[0])} />
        <SegmentedControl label="Timeframe" options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
        <ChoiceChips label="Starting balance (USD, simulated)" single options={REPLAY_BALANCES.map((b) => ({ value: b, label: b }))} selected={[balance]} onChange={(v) => v[0] && setBalance(v[0])} />
        <AppText variant="caption" color="textSecondary">{`Trades are reviewed against a ${REPLAY_RISK_LIMIT_PERCENT}% practice risk limit per trade.`}</AppText>
        <Button label="Start replay" onPress={() => onStart({ kind, timeframe, balance, seed: newSeed() })} />
      </Card>
    </Screen>
  );
}

/** How simulated orders fill, stated up front so results are not a surprise. */
function FillRules() {
  return (
    <AppText variant="caption" color="textSecondary" testID="fill-rules">
      {"How fills work here: a market order fills at the next candle's open. A limit order or target fills only once price trades beyond it, at its own price, never better. A stop that the candle gaps past fills at the open, which is worse. If one candle reaches both your stop and your target, the stop is assumed to fill first. On the candle where a pending order fills, only the stop is checked, because the rest of that candle may have happened before your entry."}
    </AppText>
  );
}

/** The date of a real candle ("2024-03-04"); generated scenarios have made-up dates, so they get none. */
const realDate = (iso: string) => iso.slice(0, 10);

function levelsFor(view: ReplayView): readonly LevelLine[] {
  const p = view.position;
  if (p) {
    return [
      { price: Number(p.entry), label: `Entry ${p.entry.toString()}`, tone: 'primary' },
      ...(p.stopLoss ? [{ price: Number(p.stopLoss), label: `Stop ${p.stopLoss.toString()}`, tone: 'negative' as const }] : []),
      ...(p.takeProfit ? [{ price: Number(p.takeProfit), label: `Target ${p.takeProfit.toString()}`, tone: 'positive' as const }] : []),
    ];
  }
  const o = view.orders[0];
  if (!o) return [];
  return [
    ...(o.price ? [{ price: Number(o.price), label: `${o.side} ${o.type} ${o.price.toString()}`, tone: 'textMuted' as const }] : []),
    ...(o.stopLoss ? [{ price: Number(o.stopLoss), label: `Stop ${o.stopLoss.toString()}`, tone: 'negative' as const }] : []),
    ...(o.takeProfit ? [{ price: Number(o.takeProfit), label: `Target ${o.takeProfit.toString()}`, tone: 'positive' as const }] : []),
  ];
}

function ReplayRunner({ setup, onNew }: { readonly setup: ReplaySetup; readonly onNew: () => void }) {
  const r = useReplay(setup);
  const { spacing } = useTheme();
  const [note, setNote] = useState('');
  const reduceMotion = useReduceMotion();
  const { setSpeedMs } = r;
  // With reduce motion on, Play starts at the slowest speed; the learner can still choose another.
  useEffect(() => {
    if (reduceMotion) setSpeedMs(SLOWEST_SPEED_MS);
  }, [reduceMotion, setSpeedMs]);
  const candles = useMemo(() => (r.view ? toChartCandles(r.view.candles) : []), [r.view]);
  const levels = useMemo(() => (r.view ? levelsFor(r.view) : []), [r.view]);
  if (!r.view) return <Screen>{r.error ? <ErrorState error={r.error} onRetry={r.restart} /> : null}</Screen>;
  const view = r.view;
  const last = view.candles[view.candles.length - 1];
  const unrealised = view.equity.minus(view.balance);
  return (
    <Screen testID="replay-screen">
      <ChartHeader
        title={setup.data ? setup.data.label : SCENARIO_LABELS[setup.kind]}
        timeframe={setup.timeframe}
        badge="replay"
        badgeDetail={setup.data && last ? realDate(last.time) : undefined}
        testID="replay-header"
      />
      {setup.data ? <AppText variant="caption" color="textSecondary" testID="real-data-label">{`${setup.data.label}: real past prices. Trades and balance are simulated.`}</AppText> : <SimulatedNotice />}
      {/* Announced after each step the learner takes; quiet while it plays by itself. */}
      <AppText testID="replay-time" color="textSecondary" tabular accessibilityLiveRegion={r.playing ? 'none' : 'polite'}>{`Now: ${last ? (setup.data ? realTime(last.time) : simulatedTime(last.time)) : ''} · ${view.remaining} candles left`}</AppText>
      <PriceChart candles={candles} levels={levels} followLatest realData={setup.data !== undefined} testID="replay-chart" />
      {r.error ? (
        <Notice live title="That did not work" tone="warning">
          <AppText testID="replay-error">{errorText(r.error)}</AppText>
          <Button label="OK" variant="secondary" onPress={r.dismissError} />
        </Notice>
      ) : null}
      {!r.review ? (
        <ReplayControls
          playing={r.playing}
          speedMs={r.speedMs}
          speeds={REPLAY_SPEEDS}
          canStepBack={view.canStepBack}
          finished={view.finished}
          busy={r.saving}
          onNext={r.next}
          onBack={r.back}
          onTogglePlay={() => r.setPlaying(!r.playing)}
          onSpeed={r.setSpeedMs}
        />
      ) : null}
      <Card testID="replay-balance">
        <CardHeader icon={ChartColumn} title="Replay account" badge="replay" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatTile caption="Balance" value={moneyText(view.balance)} money accessibilityLabel={`Balance, replay, ${spokenMoney(view.balance)}`} testID="replay-balance-value" />
          <StatTile caption="Equity" value={moneyText(view.equity)} money accessibilityLabel={`Equity, replay, ${spokenMoney(view.equity)}`} testID="replay-equity-value" />
        </View>
      </Card>
      {!r.review && view.position ? <PositionCard view={view} unrealised={unrealised} onClose={r.close} onEdit={r.edit} /> : null}
      {!r.review && view.orders[0] ? (
        <Card>
          <CardHeader icon={Clock} title="Pending order" badge="replay" />
          <AppText>
            {view.orders[0].type === 'market'
              ? `${view.orders[0].side} at the next candle's open`
              : `${view.orders[0].side} ${view.orders[0].type} at ${view.orders[0].price?.toString() ?? ''}`}
          </AppText>
          <Button label="Cancel order" variant="secondary" onPress={r.cancelOrder} disabled={r.saving} />
        </Card>
      ) : null}
      {!r.review && !view.position && view.orders.length === 0 && !view.finished ? <OrderTicket lastPrice={last?.close.toString() ?? ''} onPlace={r.place} /> : null}
      {!r.review ? (
        <Card>
          <CardHeader icon={ClipboardList} title="Finish" />
          <TextField label="Your plan and what you saw (optional)" value={note} onChangeText={setNote} multiline maxLength={MAX_REPLAY_NOTE_LENGTH} testID="replay-note" />
          <Button label="Finish and review" onPress={() => void r.finish(note)} busy={r.saving} disabled={r.playing} />
        </Card>
      ) : (
        <Card>
          <CardHeader icon={ListChecks} title="Replay review" badge="replay" />
          <AppText variant="heading" testID="replay-review-title">
            {r.review.processScore === null ? 'Review' : `Process score ${Math.round(r.review.processScore * 100)}%`}
          </AppText>
          {r.review.trades.length > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <AppText color="textSecondary" accessibilityElementsHidden importantForAccessibility="no">
                Net result
              </AppText>
              <PnLValue direction={directionOf(r.review.netResult.toNumber(), 2)} amount={moneyMagnitude(r.review.netResult)} subject="Net result, replay" testID="replay-net-result" />
            </View>
          ) : null}
          {r.review.summary.map((l) => (
            <AppText key={l}>{l}</AppText>
          ))}
          {r.review.trades.flatMap((t) => t.lines).map((l, i) => (
            <AppText key={`${i}-${l}`} color="textSecondary">
              {l}
            </AppText>
          ))}
          <AppText variant="caption" color="textSecondary">{setup.data ? 'Reviewed, not saved: replays of real data do not count towards progress.' : 'Saved. Each replay is kept as its own record.'}</AppText>
          <Button label="Replay this chart again" variant="secondary" onPress={() => { setNote(''); r.restart(); }} />
          <Button label="New replay" onPress={onNew} />
        </Card>
      )}
    </Screen>
  );
}

interface PositionCardProps {
  readonly view: ReplayView;
  readonly unrealised: ReplayView['balance'];
  readonly onClose: (f: '1' | '0.5') => boolean;
  readonly onEdit: (stop: string, target: string) => boolean;
}

function PositionCard({ view, unrealised, onClose, onEdit }: PositionCardProps) {
  const { spacing } = useTheme();
  const p = view.position;
  const [stop, setStop] = useState(p?.stopLoss?.toString() ?? '');
  const [target, setTarget] = useState(p?.takeProfit?.toString() ?? '');
  if (!p) return null;
  return (
    <Card>
      <CardHeader icon={Target} title="Open trade" badge="replay" />
      <View testID="replay-position" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <AppText tabular>{`${p.side} ${p.units.toString()} units at ${p.entry.toString()} · unrealised`}</AppText>
        <PnLValue direction={directionOf(unrealised.toNumber(), 2)} amount={moneyMagnitude(unrealised)} subject="Unrealised result, replay" />
      </View>
      <TextField label="Stop loss" value={stop} onChangeText={setStop} keyboardType="decimal-pad" testID="edit-stop" />
      <TextField label="Take profit" value={target} onChangeText={setTarget} keyboardType="decimal-pad" testID="edit-target" />
      <Button label="Save stop and target" variant="secondary" onPress={() => onEdit(stop, target)} />
      <Button label="Close half" variant="secondary" onPress={() => onClose('0.5')} />
      <Button label="Close trade" onPress={() => onClose('1')} />
    </Card>
  );
}
