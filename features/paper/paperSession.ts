import { processScore } from '../../domain/journal';
import { generateScenario, type ScenarioKind } from '../../domain/market';
import { checkOrder, cooldown, type CooldownState, type RiskRules, type RuleViolation } from '../../domain/risk';
import {
  closedPositions,
  consecutiveLosses,
  currentMid,
  equityOf,
  marginFor,
  marginUsed,
  PAPER_CANDLE_COUNT,
  paperView,
  plannedLoss,
  referencePrice,
  startPaper,
  type PaperOrderRequest,
  type PaperState,
  type PaperTrade,
  type PracticeInstrument,
} from '../../domain/simulation';
import type { Candle, Timeframe } from '../../domain/models/markets';
import type { JournalEntryInput, PaperAccount } from '../../data';
import { dec, isTypedNumber, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';

/**
 * Paper trading sessions (spec §17) on top of the domain engine: candles
 * from the account's scenario seed, order forms, the risk check before an
 * order (§19, §32A.5), and journal entries for closed trades (§22).
 */

export const PAPER_CANDLES = PAPER_CANDLE_COUNT;
export const PAPER_BALANCES: readonly string[] = ['1000', '10000', '50000'];
export const DEFAULT_PAPER_BALANCE = '10000';
export const PAPER_TIMEFRAMES: readonly Timeframe[] = ['M15', 'H1', 'H4', 'D1'];
export const PAPER_LABEL = 'Paper trading — simulated';

export function paperCandles(instrument: PracticeInstrument, kind: string, seed: number, timeframe: Timeframe): readonly Candle[] {
  return generateScenario({ kind: kind as ScenarioKind, seed, count: PAPER_CANDLES, timeframe, startPrice: instrument.startPrice, precision: instrument.precision }).candles;
}

/** Starts somewhere in the first quarter, picked by the seed, so there is history to read. */
export function paperStartIndex(seed: number): number {
  const earliest = 60;
  return earliest + (seed % Math.max(1, Math.floor(PAPER_CANDLES / 4) - earliest));
}

export function newPaperState(instrument: PracticeInstrument, candles: readonly Candle[], seed: number, balance: string): Result<PaperState, AppError> {
  if (!isTypedNumber(balance)) return err(validationError('Starting balance must be a number'));
  return startPaper(instrument, candles, paperStartIndex(seed), dec(balance));
}

export interface TicketForm {
  readonly side: 'buy' | 'sell';
  readonly type: 'market' | 'limit' | 'stop';
  readonly size: string;
  readonly price: string;
  readonly stopLoss: string;
  readonly takeProfit: string;
}

const optionalPrice = (text: string, label: string): Result<Decimal | null, AppError> => {
  const t = text.trim().replace(',', '.');
  if (t === '') return ok(null);
  if (!isTypedNumber(t) || dec(t).lte(0)) return err(validationError(`${label} must be a positive number`));
  return ok(dec(t));
};

export interface OrderCheck {
  readonly request: PaperOrderRequest;
  /** Loss if the stop fills at its level; null without a stop. */
  readonly plannedRisk: Decimal | null;
  readonly marginNeeded: Decimal;
  readonly violations: readonly RuleViolation[];
}

/**
 * Parses the ticket and checks it against the learner's rules. Violations
 * are shown before placing; placing anyway records them with the trade.
 */
export function checkTicket(s: PaperState, i: PracticeInstrument, candles: readonly Candle[], form: TicketForm, rules: RiskRules): Result<OrderCheck, AppError> {
  const sizeText = form.size.trim().replace(',', '.');
  if (!isTypedNumber(sizeText) || dec(sizeText).lte(0)) return err(validationError('Size must be a positive number'));
  const price = optionalPrice(form.price, 'Order price');
  if (!price.ok) return price;
  if (form.type !== 'market' && price.value === null) return err(validationError('Enter the order price'));
  const stopLoss = optionalPrice(form.stopLoss, 'Stop loss');
  if (!stopLoss.ok) return stopLoss;
  const takeProfit = optionalPrice(form.takeProfit, 'Take profit');
  if (!takeProfit.ok) return takeProfit;

  const size = dec(sizeText);
  const mid = currentMid(s, candles);
  const reference = referencePrice(s, candles, { type: form.type, price: price.value });
  const plannedRisk = stopLoss.value ? plannedLoss(i, form.side, size, reference, stopLoss.value) : null;
  const equity = equityOf(i, s, mid);
  const marginNeeded = marginFor(i, size, reference);
  // The whole last position, not its final partial close, so its full planned risk is compared.
  const positions = closedPositions(s.history);
  const last = positions[positions.length - 1];
  const violations = checkOrder(rules, {
    equity,
    plannedRisk,
    openPositions: s.positions.length,
    marginAfter: marginUsed(i, s.positions, mid).plus(marginNeeded),
    dayStartBalance: s.dayStartBalance,
    dayRealised: s.balance.minus(s.dayStartBalance),
    lastTrade: last ? { lost: last.net.isNegative(), plannedRisk: last.plannedRisk } : null,
  });
  return ok({
    request: {
      side: form.side,
      type: form.type,
      size,
      price: form.type === 'market' ? null : price.value,
      stopLoss: stopLoss.value,
      takeProfit: takeProfit.value,
      violations: violations.map((v) => v.rule),
      plannedRisk,
      equityAtOrder: equity,
    },
    plannedRisk,
    marginNeeded,
    violations,
  });
}

export function paperCooldown(s: PaperState, rules: RiskRules): CooldownState | null {
  return cooldown(rules, consecutiveLosses(s.history), s.dayStartBalance, s.balance.minus(s.dayStartBalance));
}

/**
 * A closed paper trade as a journal entry (source: paper), with its process
 * score. `historyIndex` (its place in the account's history) makes the id
 * unique, so logging the same trade twice is skipped as a duplicate.
 */
export function paperTradeToJournal(account: PaperAccount, i: PracticeInstrument, candles: readonly Candle[], t: PaperTrade, rules: RiskRules, historyIndex: number): JournalEntryInput {
  const pips = t.exit.minus(t.entry).times(t.side === 'buy' ? 1 : -1).div(i.pipSize);
  const base = {
    stop: t.initialStop ? t.initialStop.toString() : null,
    plannedRisk: t.plannedRisk ? t.plannedRisk.toDecimalPlaces(2).toString() : null,
    equityAtEntry: t.equityAtOrder.toString(),
    ruleViolations: [...t.violations],
    entryRationale: null,
    review: null,
  };
  return {
    source: 'paper',
    sourceRef: account.id,
    externalId: `${account.id}:${account.resets}:${historyIndex}`,
    market: i.market,
    instrument: i.symbol,
    direction: t.side,
    strategy: null,
    entry: t.entry.toString(),
    stop: base.stop,
    target: null,
    size: t.size.toString(),
    sizeUnit: i.sizeUnit,
    exit: t.exit.toString(),
    pnlMoney: t.net.toString(),
    pnlPips: pips.toDecimalPlaces(1).toString(),
    pnlR: base.plannedRisk && dec(base.plannedRisk).gt(0) ? t.net.div(base.plannedRisk).toDecimalPlaces(2).toString() : null,
    plannedRisk: base.plannedRisk,
    costs: t.costs.toString(),
    equityAtEntry: base.equityAtEntry,
    openedAt: candles[t.openedAt]?.time ?? null,
    closedAt: candles[t.closedAt]?.time ?? null,
    conditions: null,
    entryRationale: null,
    exitRationale: EXIT_REASONS[t.reason],
    emotion: null,
    ruleViolations: base.ruleViolations,
    noteBefore: null,
    noteAfter: null,
    screenshotUri: null,
    processScore: processScore({ ...base, source: 'paper' }, rules.maxRiskPerTradePercent).score,
  };
}

const EXIT_REASONS: Readonly<Record<PaperTrade['reason'], string>> = {
  stop_loss: 'Closed at the stop loss',
  take_profit: 'Closed at the take profit',
  manual: 'Closed by hand',
  end_of_data: 'Closed when the session ended',
  stop_out: 'Closed by a stop out (not enough margin)',
};

/** Trades closed by the latest step: in `next` but not in `prev`. */
export function newTrades(prev: PaperState, next: PaperState): readonly PaperTrade[] {
  return next.history.slice(prev.history.length);
}

export { paperView };
