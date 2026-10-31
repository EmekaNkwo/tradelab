import { dec, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { Candle } from '../models/markets';
import { sizePosition } from '../risk/sizing';
import { advancePaper, closePaperPositionAtNextOpen, equityOf, placePaperOrder, startPaper, type PaperState, type PaperTrade } from '../simulation/paper';
import { practiceInstrument, type PracticeInstrument } from '../simulation/instruments';
import { halfSpread } from '../simulation/pricing';
import { costIssues, withCosts, type BacktestCosts } from './costs';
import { checkCandlesStepwise, type DataCheck, type Dataset, type Regime } from './dataset';
import { PERIOD_KINDS, type ConditionGroup, type StrategyDefinition } from './model';
import { groupAt, prepareSeriesStepwise, stopLevel, type PreparedSeries } from './signals';
import { drainSteps, type Steps } from './stepwise';
import { definitionIssues } from './validate';

/**
 * Backtest engine (spec §16.3). It drives the paper trading engine itself, so
 * fills, costs, margin and stop outs follow exactly the rules of paper
 * trading and replay (`domain/market/fills.ts`). Pure and deterministic, and
 * resumable: `stepBacktest` processes a slice of candles so the caller can
 * yield to the UI between slices, show progress and cancel.
 *
 * At each closed candle i the engine decides with data up to i only, then
 * reveals candle i + 1: entries are market orders filled at its open, rule
 * exits close at its open, and stops and targets are checked on it. Session
 * hours and the (hindsight, report-only) regime label use candle i + 1, the
 * candle the trade opens on.
 */

/** Bump whenever a rule change can change results; runs from another version are flagged. */
export const ENGINE_VERSION = 2;

export type SplitRule =
  | { readonly kind: 'none' }
  /** The first `inSamplePercent` of the candles is in-sample, the rest out-of-sample. */
  | { readonly kind: 'holdout'; readonly inSamplePercent: number }
  /** Period blocks: equal consecutive blocks, each reported on its own, with no refitting between them. */
  | { readonly kind: 'walk_forward'; readonly folds: number };

export interface BacktestSetup {
  readonly definition: StrategyDefinition;
  readonly dataset: Dataset;
  readonly capital: Decimal;
  readonly costs: BacktestCosts;
  readonly split: SplitRule;
}

export type SkipReason = 'below_minimum_size' | 'not_enough_funds' | 'conflicting_signals' | 'no_stop_yet' | 'invalid_levels' | 'outside_session' | 'daily_limit';

export type BacktestExitReason = 'stop_loss' | 'take_profit' | 'exit_rule' | 'end_of_data' | 'stop_out';

export interface BacktestTrade {
  readonly side: 'buy' | 'sell';
  readonly size: Decimal;
  /** Candle the signal closed on; the fill is on the next one. */
  readonly signalIndex: number;
  readonly entryIndex: number;
  readonly exitIndex: number;
  readonly entry: Decimal;
  readonly exit: Decimal;
  readonly net: Decimal;
  /** Commission and swap (spread and slippage are inside the prices); negative is a cost. */
  readonly costs: Decimal;
  /** Loss planned at the stop, costs included: one R. */
  readonly plannedRisk: Decimal;
  readonly r: Decimal;
  readonly notional: Decimal;
  readonly reason: BacktestExitReason;
  readonly regime: Regime;
}

interface TradeMeta {
  readonly signalIndex: number;
  readonly regime: Regime;
  readonly plannedRisk: Decimal;
}

export interface BacktestState {
  readonly setup: BacktestSetup;
  readonly instrument: PracticeInstrument;
  readonly series: PreparedSeries;
  readonly warmup: number;
  readonly dataCheck: DataCheck;
  readonly paper: PaperState;
  /** Position to close at the next open because its exit rule fired. */
  readonly pendingExit: number | null;
  readonly meta: ReadonlyMap<number, TradeMeta>;
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
  /** Equity at each close from the warm-up candle on. */
  readonly equity: readonly number[];
  readonly candlesInMarket: number;
  readonly day: string;
  readonly entriesToday: number;
  readonly lossesInRow: number;
  readonly done: boolean;
}

const dayOf = (c: Candle) => c.time.slice(0, 10);

function groupLookback(g: ConditionGroup | null): number {
  let most = 0;
  for (const c of g?.conditions ?? []) {
    for (const o of [c.left, c.right]) {
      if (o.kind !== 'indicator') continue;
      const period = PERIOD_KINDS.has(o.indicator) ? (o.period ?? 0) : 0;
      // RSI and channels need one candle more than their period; crosses read the candle before.
      most = Math.max(most, period + o.ago + 2);
    }
  }
  return most;
}

/** Candles skipped at the start so every indicator the rules read is known. */
export function warmupFor(d: StrategyDefinition): number {
  const stop = d.stop.kind === 'percent' ? 0 : d.stop.period + 1;
  return Math.max(1, groupLookback(d.longEntry), groupLookback(d.shortEntry), groupLookback(d.longExit), groupLookback(d.shortExit), stop);
}

function inSession(d: StrategyDefinition, c: Candle): boolean {
  if (!d.session) return true;
  const hour = Number(c.time.slice(11, 13));
  const { startHourUtc: a, endHourUtc: b } = d.session;
  return a < b ? hour >= a && hour < b : hour >= a || hour < b;
}

export function createBacktest(setup: BacktestSetup): Result<BacktestState, AppError> {
  return drainSteps(createBacktestStepwise(setup, setup.dataset.candles.length));
}

/**
 * `createBacktest` in steps of `chunk` candles (ADR 0006): the data checks
 * and the indicator precomputation pause between chunks, so the sliced runner
 * can yield before the first engine slice. A setup that fails validation
 * returns at once, without yielding.
 */
export function* createBacktestStepwise(setup: BacktestSetup, chunk: number): Steps<Result<BacktestState, AppError>> {
  const { definition: d, dataset, capital, costs } = setup;
  const issues = definitionIssues(d);
  if (issues[0]) return err(validationError(issues[0].message, { issues: issues.map((i) => i.field) }));
  const costProblem = costIssues(costs)[0];
  if (costProblem) return err(validationError(`Costs: ${costProblem.message}`, { issues: [costProblem.field] }));
  if (!capital.isFinite() || capital.lte(0)) return err(validationError('Starting capital must be more than zero'));
  if (dataset.spec.instrumentId !== d.instrumentId || dataset.spec.timeframe !== d.timeframe) {
    return err(validationError('The data is for a different market or timeframe than the strategy'));
  }
  if (setup.split.kind === 'holdout' && !(setup.split.inSamplePercent >= 30 && setup.split.inSamplePercent <= 90)) {
    return err(validationError('In-sample share must be from 30% to 90%'));
  }
  if (setup.split.kind === 'walk_forward' && !(Number.isInteger(setup.split.folds) && setup.split.folds >= 2 && setup.split.folds <= 10)) {
    return err(validationError('Use 2 to 10 period blocks'));
  }
  const dataCheck = yield* checkCandlesStepwise(dataset.candles, d.timeframe, chunk);
  if (dataCheck.errors.length > 0) return err(validationError(`The data failed its checks: ${dataCheck.errors[0]}`));
  const base = practiceInstrument(d.instrumentId);
  if (!base) return err(validationError('Choose a practice market'));
  const instrument = withCosts(base, costs);
  const warmup = warmupFor(d);
  if (warmup >= dataset.candles.length - 2) return err(validationError('The rules need more history than this data has'));
  const started = startPaper(instrument, dataset.candles, warmup, capital);
  if (!started.ok) return started;
  yield;
  const series = yield* prepareSeriesStepwise(d, dataset.candles, chunk);
  return ok({
    setup,
    instrument,
    series,
    warmup,
    dataCheck,
    paper: started.value,
    pendingExit: null,
    meta: new Map(),
    skipped: {},
    equity: [capital.toNumber()],
    candlesInMarket: 0,
    day: dayOf(dataset.candles[warmup] as Candle),
    entriesToday: 0,
    lossesInRow: 0,
    done: false,
  });
}

interface Working {
  paper: PaperState;
  pendingExit: number | null;
  meta: Map<number, TradeMeta>;
  skipped: Partial<Record<SkipReason, number>>;
  equity: number[];
  candlesInMarket: number;
  day: string;
  entriesToday: number;
  lossesInRow: number;
}

const skip = (w: Working, reason: SkipReason) => {
  w.skipped = { ...w.skipped, [reason]: (w.skipped[reason] ?? 0) + 1 };
};

function tryEntry(s: BacktestState, w: Working, i: number): void {
  const d = s.setup.definition;
  const candles = s.setup.dataset.candles;
  const c = candles[i] as Candle;
  const longs = d.direction !== 'short' && groupAt(d.longEntry, s.series, i);
  const shorts = d.direction !== 'long' && groupAt(d.shortEntry, s.series, i);
  if (!longs && !shorts) return;
  if (longs && shorts) return skip(w, 'conflicting_signals');
  const next = candles[i + 1];
  if (!next) return;
  if (!inSession(d, next)) return skip(w, 'outside_session');
  const p = w.paper;
  const dayLoss = p.dayStartBalance.gt(0) ? p.balance.minus(p.dayStartBalance).div(p.dayStartBalance).times(100) : dec(0);
  const limits = d.limits;
  if (
    w.entriesToday >= limits.maxTradesPerDay ||
    (limits.dailyLossPercent !== null && dayLoss.lte(-limits.dailyLossPercent)) ||
    (limits.pauseAfterLosses !== null && w.lossesInRow >= limits.pauseAfterLosses)
  ) {
    return skip(w, 'daily_limit');
  }
  const side = longs ? 'buy' : 'sell';
  const reference = c.close;
  const rawStop = stopLevel(d.stop, side, s.series, i, reference.toNumber());
  if (rawStop === null || !Number.isFinite(rawStop) || rawStop <= 0) return skip(w, 'no_stop_yet');
  const precision = s.instrument.precision;
  const stop = dec(rawStop).toDecimalPlaces(precision);
  const buy = side === 'buy';
  if (buy ? stop.gte(reference) : stop.lte(reference)) return skip(w, 'invalid_levels');
  const distance = reference.minus(stop).abs();
  const target = d.target.kind === 'r_multiple' ? reference.plus(distance.times(d.target.r).times(buy ? 1 : -1)).toDecimalPlaces(precision) : null;
  if (target && target.lte(0)) return skip(w, 'invalid_levels');
  // The fill candle already opens beyond the stop or the target: the trade cannot be placed as planned.
  if (buy ? next.open.lte(stop) || (target !== null && next.open.gte(target)) : next.open.gte(stop) || (target !== null && next.open.lte(target))) {
    return skip(w, 'invalid_levels');
  }
  const equity = equityOf(s.instrument, p, reference);
  const i0 = s.instrument;
  const sized = sizePosition({
    balance: equity,
    riskPercent: dec(d.riskPercent),
    side,
    entry: reference,
    stop,
    target,
    spec: { contractSize: i0.contractSize, pipSize: i0.pipSize, lotStep: i0.sizeStep, minLot: i0.minSize },
    quoteToAccount: dec(1),
    // Entry pays half the spread plus slippage; the stop pays slippage again.
    costs: { spreadPips: halfSpread(i0).plus(i0.slippage.times(2)).div(i0.pipSize), commissionPerLot: i0.commissionPerSide.times(2) },
  });
  if (!sized.ok) return skip(w, 'invalid_levels');
  if (sized.value.belowMinimum) return skip(w, 'below_minimum_size');
  const size = i0.maxOrderSize && sized.value.lots.gt(i0.maxOrderSize) ? i0.maxOrderSize : sized.value.lots;
  const plannedRisk = sized.value.netLossAtStop.times(size).div(sized.value.lots);
  const placed = placePaperOrder(p, i0, candles, { side, type: 'market', size, price: null, stopLoss: stop, takeProfit: target, violations: [], plannedRisk, equityAtOrder: equity });
  if (!placed.ok) return skip(w, 'not_enough_funds');
  w.paper = placed.value;
  const orderId = placed.value.nextId - 1;
  w.meta.set(orderId, { signalIndex: i, regime: s.setup.dataset.regimes[i + 1] ?? 'ranging', plannedRisk });
  w.entriesToday += 1;
}

/** Processes up to `maxCandles` more candles. Returns the same state once done. */
export function stepBacktest(s: BacktestState, maxCandles: number): BacktestState {
  if (s.done) return s;
  const d = s.setup.definition;
  const candles = s.setup.dataset.candles;
  const last = candles.length - 1;
  const w: Working = {
    paper: s.paper,
    pendingExit: s.pendingExit,
    meta: new Map(s.meta),
    skipped: { ...s.skipped },
    equity: [],
    candlesInMarket: s.candlesInMarket,
    day: s.day,
    entriesToday: s.entriesToday,
    lossesInRow: s.lossesInRow,
  };
  for (let n = 0; n < maxCandles && w.paper.cursor < last; n += 1) {
    const i = w.paper.cursor;
    const today = dayOf(candles[i] as Candle);
    if (today !== w.day) {
      w.day = today;
      w.entriesToday = 0;
      w.lossesInRow = 0;
    }
    const open = w.paper.positions[0];
    if (open) {
      if (w.pendingExit === null && groupAt(open.side === 'buy' ? d.longExit : d.shortExit, s.series, i)) w.pendingExit = open.id;
    } else if (w.paper.orders.length === 0) {
      tryEntry(s, w, i);
    }
    const before = w.paper.history.length;
    if (w.pendingExit !== null) {
      const closed = closePaperPositionAtNextOpen(w.paper, s.instrument, candles, w.pendingExit);
      if (closed.ok) w.paper = closed.value;
      w.pendingExit = null;
    }
    w.paper = advancePaper(w.paper, s.instrument, candles);
    const closedNow = w.paper.history.slice(before);
    for (const t of closedNow) w.lossesInRow = t.net.isNegative() ? w.lossesInRow + 1 : 0;
    const c = candles[w.paper.cursor] as Candle;
    w.equity.push(equityOf(s.instrument, w.paper, c.close).toNumber());
    // In the market if a position was open at any point of this candle: still open, or closed on it.
    if (w.paper.positions.length > 0 || closedNow.length > 0) w.candlesInMarket += 1;
  }
  return {
    ...s,
    paper: w.paper,
    pendingExit: w.pendingExit,
    meta: w.meta,
    skipped: w.skipped,
    equity: [...s.equity, ...w.equity],
    candlesInMarket: w.candlesInMarket,
    day: w.day,
    entriesToday: w.entriesToday,
    lossesInRow: w.lossesInRow,
    done: w.paper.cursor >= last,
  };
}

/** Share of the candles processed, from 0 to 1. */
export function backtestProgress(s: BacktestState): number {
  const total = s.setup.dataset.candles.length - 1 - s.warmup;
  return total <= 0 ? 1 : Math.min(1, (s.paper.cursor - s.warmup) / total);
}

function toTrade(s: BacktestState, t: PaperTrade): BacktestTrade {
  const meta = s.meta.get(t.positionId);
  const plannedRisk = meta?.plannedRisk ?? t.plannedRisk ?? dec(0);
  // The only manual closes in a backtest are rule exits at the next open.
  const reason: BacktestExitReason = t.reason === 'manual' ? 'exit_rule' : t.reason;
  return {
    side: t.side,
    size: t.size,
    signalIndex: meta?.signalIndex ?? t.openedAt - 1,
    entryIndex: t.openedAt,
    exitIndex: t.closedAt,
    entry: t.entry,
    exit: t.exit,
    net: t.net,
    costs: t.costs,
    plannedRisk,
    r: plannedRisk.gt(0) ? t.net.div(plannedRisk) : dec(0),
    notional: t.entry.times(t.size).times(s.instrument.contractSize),
    reason,
    regime: meta?.regime ?? 'ranging',
  };
}

/** Closed trades so far, oldest first. */
export const backtestTrades = (s: BacktestState): readonly BacktestTrade[] => s.paper.history.map((t) => toTrade(s, t));
