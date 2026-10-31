import {
  cancelOrders,
  closePosition,
  editPosition,
  generateScenario,
  nextCandle,
  placeOrder,
  replayView,
  reviewReplay,
  startReplay,
  stepBack,
  type ClosedTrade,
  type OrderRequest,
  type OrderType,
  type ReplayReview,
  type ReplayState,
  type ReplayView,
  type ScenarioKind,
  type Side,
} from '../../domain/market';
import type { Candle, Timeframe } from '../../domain/models/markets';
import type { ReplayAttempt, StoredReplayTrade } from '../../domain/models/practice';
import { STANDARD_LOT } from '../../domain/calculators';
import { dec, isDecimalString, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import type { Container } from '../app';
import type { JournalEntryInput } from '../../data';
import { processScore } from '../../domain/journal';
import { logger } from '../../shared/logger';

/**
 * Replay sessions (spec §13.2) on top of the domain engine. Screens receive
 * only `ReplayView`; the engine state with its upcoming candles stays here.
 */

export const SCENARIO_LABELS: Readonly<Record<ScenarioKind, string>> = {
  strong_uptrend: 'Strong uptrend',
  downtrend: 'Downtrend',
  range: 'Range',
  breakout: 'Breakout',
  false_breakout: 'False breakout',
  pullback: 'Pullback',
  reversal: 'Reversal',
  high_volatility: 'High volatility',
  low_volatility: 'Low volatility',
  news_shock: 'News shock',
  crash: 'Crash',
  recovery: 'Recovery',
  sideways: 'Long sideways market',
};

export const REPLAY_TIMEFRAMES: readonly Timeframe[] = ['M15', 'H1', 'H4', 'D1'];
export const REPLAY_BALANCES: readonly string[] = ['1000', '5000', '10000'];
export const REPLAY_CANDLES = 300;
/** The learner's risk limit used for the process review. */
export const REPLAY_RISK_LIMIT_PERCENT = '2';

/** The learner's own forex data to replay instead of a simulated scenario (spec §30). */
export interface RealReplayData {
  readonly datasetId: string;
  readonly label: string;
  readonly candles: readonly Candle[];
}

/** Real data needs enough candles for a random start part-way in and something left to replay. */
export const MIN_REAL_REPLAY_CANDLES = 200;

export interface ReplaySetup {
  readonly kind: ScenarioKind;
  readonly seed: number;
  readonly timeframe: Timeframe;
  readonly balance: string;
  /** Set to replay real data; `kind` is then unused. Such replays are reviewed but not saved as practice records. */
  readonly data?: RealReplayData;
}

/** A seed from the clock, so each new session differs but can be replayed exactly. */
export function seedFrom(now: Date): number {
  return Math.abs(now.getTime() % 2147483647) || 1;
}

/** Where the replay starts: somewhere in the first third, chosen by the seed ("random start"). */
export function startIndexFor(seed: number, count = REPLAY_CANDLES): number {
  const earliest = 60;
  const span = Math.max(1, Math.floor(count / 3) - earliest);
  return earliest + (seed % span);
}

export function startSession(setup: ReplaySetup): Result<ReplayState, AppError> {
  if (!isDecimalString(setup.balance)) return err(validationError('Starting balance must be a number'));
  if (setup.data) {
    const all = setup.data.candles;
    if (all.length < MIN_REAL_REPLAY_CANDLES) return err(validationError(`Replay needs at least ${MIN_REAL_REPLAY_CANDLES} candles; this data has ${all.length}`));
    const size = Math.min(REPLAY_CANDLES, all.length);
    // The seed picks which stretch of the data is replayed, and where in it the replay starts.
    const offset = setup.seed % (all.length - size + 1);
    return startReplay(all.slice(offset, offset + size), startIndexFor(setup.seed, size), dec(setup.balance));
  }
  const scenario = generateScenario({ kind: setup.kind, seed: setup.seed, count: REPLAY_CANDLES, timeframe: setup.timeframe });
  return startReplay(scenario.candles, startIndexFor(setup.seed), dec(setup.balance));
}

export interface OrderForm {
  readonly side: Side;
  readonly type: OrderType;
  /** Size in lots (100,000 units each). */
  readonly lots: string;
  readonly price: string;
  readonly stopLoss: string;
  readonly takeProfit: string;
}

export const emptyOrderForm: OrderForm = { side: 'buy', type: 'market', lots: '0.1', price: '', stopLoss: '', takeProfit: '' };

function optionalDecimal(text: string, label: string): Result<Decimal | undefined, AppError> {
  const t = text.trim().replace(',', '.');
  if (t === '') return ok(undefined);
  if (!isDecimalString(t) || dec(t).lte(0)) return err(validationError(`${label} must be a positive number`));
  return ok(dec(t));
}

/** Validates the order form text into an engine order. Engine checks (sides of stop/target, price placement) follow. */
export function parseOrderForm(form: OrderForm): Result<OrderRequest, AppError> {
  const lots = optionalDecimal(form.lots, 'Size');
  if (!lots.ok) return lots;
  if (!lots.value) return err(validationError('Enter a size in lots'));
  const price = optionalDecimal(form.price, 'Order price');
  const stopLoss = optionalDecimal(form.stopLoss, 'Stop loss');
  const takeProfit = optionalDecimal(form.takeProfit, 'Take profit');
  for (const r of [price, stopLoss, takeProfit]) if (!r.ok) return r;
  if (form.type !== 'market' && !(price.ok && price.value)) return err(validationError('Enter the order price'));
  return ok({
    side: form.side,
    type: form.type,
    units: lots.value.times(STANDARD_LOT),
    ...(form.type !== 'market' && price.ok && price.value ? { price: price.value } : {}),
    ...(stopLoss.ok && stopLoss.value ? { stopLoss: stopLoss.value } : {}),
    ...(takeProfit.ok && takeProfit.value ? { takeProfit: takeProfit.value } : {}),
  });
}

/** Moves the stop and target of the open trade from form text; an empty field removes that level. */
export function editFromForm(state: ReplayState, stopText: string, targetText: string): Result<ReplayState, AppError> {
  const stop = optionalDecimal(stopText, 'Stop loss');
  if (!stop.ok) return stop;
  const target = optionalDecimal(targetText, 'Take profit');
  if (!target.ok) return target;
  return editPosition(state, stop.value ?? null, target.value ?? null);
}

export type ReplayAction =
  | { readonly type: 'next' }
  | { readonly type: 'back' }
  | { readonly type: 'cancel' }
  | { readonly type: 'close'; readonly fraction: Decimal }
  | { readonly type: 'place'; readonly form: OrderForm }
  | { readonly type: 'edit'; readonly stop: string; readonly target: string };

/** Applies a learner action. Errors leave the state unchanged and explain why. */
export function applyAction(state: ReplayState, action: ReplayAction): Result<ReplayState, AppError> {
  switch (action.type) {
    case 'next':
      return ok(nextCandle(state));
    case 'back':
      return ok(stepBack(state));
    case 'cancel':
      return ok(cancelOrders(state));
    case 'close':
      return closePosition(state, action.fraction);
    case 'place': {
      const order = parseOrderForm(action.form);
      return order.ok ? placeOrder(state, order.value) : order;
    }
    case 'edit':
      return editFromForm(state, action.stop, action.target);
  }
}

export function toStoredTrades(trades: readonly ClosedTrade[]): readonly StoredReplayTrade[] {
  return trades.map((t) => ({
    side: t.side,
    units: t.units.toString(),
    entry: t.entry.toString(),
    exit: t.exit.toString(),
    initialStop: t.initialStop?.toString() ?? null,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    reason: t.reason,
    profit: t.profit.toString(),
  }));
}

export function reviewView(view: ReplayView, startingBalance: string, stepBacks = 0): ReplayReview {
  return reviewReplay(view.closed, dec(startingBalance), dec(REPLAY_RISK_LIMIT_PERCENT), stepBacks);
}

/** Reviews a finished replay of real data without saving it: real data has no labelled market condition to count in progress. */
export function reviewUnsaved(setup: ReplaySetup, view: ReplayView, stepBacks = 0): Result<ReplayReview, AppError> {
  if (view.position || view.orders.length > 0) return err(validationError('Close the open trade or cancel the pending order before finishing'));
  return ok(reviewView(view, setup.balance, stepBacks));
}

/**
 * Saves the finished replay as a new record. An open trade is not closed for
 * the learner; it is left out, and the screen asks them to close it first.
 */
export async function saveReplay(
  c: Pick<Container, 'practice' | 'clock' | 'journal'>,
  setup: ReplaySetup,
  view: ReplayView,
  startedAt: Date,
  note: string,
  stepBacks = 0,
): Promise<Result<{ readonly attempt: ReplayAttempt; readonly review: ReplayReview }, AppError>> {
  if (view.position || view.orders.length > 0) return err(validationError('Close the open trade or cancel the pending order before finishing'));
  if (setup.data) return err(validationError('Replays of real data are reviewed, not saved'));
  const review = reviewView(view, setup.balance, stepBacks);
  const saved = await c.practice.recordReplay(
    {
      scenarioKind: setup.kind,
      seed: setup.seed,
      timeframe: setup.timeframe,
      startingBalance: setup.balance,
      finalBalance: view.balance.toString(),
      trades: toStoredTrades(view.closed),
      processScore: review.processScore,
      stepBacks,
      note: note.trim() === '' ? null : note.trim(),
      startedAt: toUtcIso(startedAt),
    },
    toUtcIso(c.clock.now()),
  );
  if (!saved.ok) return saved;
  // Each trade also goes to the journal (source: replay). The replay itself is already saved, so a failure here is only logged.
  const logged = await c.journal.addMany(replayTradesToJournal(saved.value.id, setup, view), toUtcIso(c.clock.now()));
  if (!logged.ok) logger.warn('Journal entries for a replay failed', { error: logged.error.message });
  return ok({ attempt: saved.value, review });
}

const REPLAY_EXITS: Readonly<Record<ClosedTrade['reason'], string>> = {
  stop_loss: 'Closed at the stop loss',
  take_profit: 'Closed at the take profit',
  manual: 'Closed by hand',
  end_of_data: 'Closed when the replay ended',
};

/**
 * Closed replay trades as journal entries, with the balance when the position
 * opened as the equity it was sized from. Replay holds one position at a time,
 * so partial closes are the consecutive trades with the same open time and entry.
 */
export function replayTradesToJournal(attemptId: string, setup: ReplaySetup, view: ReplayView): readonly JournalEntryInput[] {
  let balance = dec(setup.balance);
  let opened: { readonly at: number; readonly entry: string; readonly balance: Decimal } | null = null;
  return view.closed.map((t, k) => {
    if (!opened || opened.at !== t.openedAt || opened.entry !== t.entry.toString()) opened = { at: t.openedAt, entry: t.entry.toString(), balance };
    const plannedRisk = t.initialStop ? t.entry.minus(t.initialStop).abs().times(t.units) : null;
    const base = {
      stop: t.initialStop?.toString() ?? null,
      plannedRisk: plannedRisk?.toString() ?? null,
      equityAtEntry: opened.balance.toString(),
      ruleViolations: [] as string[],
      entryRationale: null,
    };
    balance = balance.plus(t.profit);
    return {
      ...base,
      source: 'replay' as const,
      sourceRef: attemptId,
      externalId: `${attemptId}:${k}`,
      market: 'forex' as const,
      instrument: `${SCENARIO_LABELS[setup.kind]} (simulated)`,
      direction: t.side,
      strategy: null,
      target: null,
      entry: t.entry.toString(),
      size: t.units.toString(),
      sizeUnit: 'units',
      exit: t.exit.toString(),
      pnlMoney: t.profit.toString(),
      pnlPips: null,
      pnlR: plannedRisk && plannedRisk.gt(0) ? t.profit.div(plannedRisk).toDecimalPlaces(2).toString() : null,
      costs: '0',
      openedAt: view.candles[t.openedAt]?.time ?? null,
      closedAt: view.candles[t.closedAt]?.time ?? null,
      conditions: null,
      exitRationale: REPLAY_EXITS[t.reason],
      emotion: null,
      noteBefore: null,
      noteAfter: null,
      screenshotUri: null,
      // Scored as not yet reviewed; `review` is not part of the stored input (the repository rejects unknown keys).
      processScore: processScore({ ...base, review: null, source: 'replay' }, Number(REPLAY_RISK_LIMIT_PERCENT)).score,
    };
  });
}

export { replayView };
