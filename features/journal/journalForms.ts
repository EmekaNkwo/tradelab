import { processScore, type ImportedTrade, type ParsedStatement } from '../../domain/journal';
import { SIMULATED_SOURCES, type EmotionRatings, type JournalEntry, type JournalReview, type JournalSource } from '../../domain/models/journal';
import type { JournalEntryInput } from '../../data';
import { dec, isTypedNumber } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { MarketKind } from '../../shared/types';
import type { UtcIso } from '../../shared/time';

/** Pure form handling for the journal: manual demo trades, imports, and reviews. */

export interface ManualTradeForm {
  readonly market: MarketKind | null;
  readonly instrument: string;
  readonly direction: 'buy' | 'sell';
  readonly size: string;
  readonly sizeUnit: string;
  readonly entry: string;
  readonly stop: string;
  readonly target: string;
  readonly exit: string;
  /** Result in account money, as MetaTrader shows it (after costs). */
  readonly result: string;
  readonly plannedRisk: string;
  readonly equity: string;
  readonly strategy: string;
  readonly entryRationale: string;
  readonly exitRationale: string;
  readonly conditions: string;
  readonly ruleViolations: readonly string[];
  readonly emotion: EmotionRatings | null;
  readonly screenshotUri: string | null;
}

export const emptyManualForm: ManualTradeForm = {
  market: 'forex',
  instrument: '',
  direction: 'buy',
  size: '',
  sizeUnit: 'lots',
  entry: '',
  stop: '',
  target: '',
  exit: '',
  result: '',
  plannedRisk: '',
  equity: '',
  strategy: '',
  entryRationale: '',
  exitRationale: '',
  conditions: '',
  ruleViolations: [],
  emotion: null,
  screenshotUri: null,
};

const clean = (t: string) => t.trim().replace(',', '.');
const textOrNull = (t: string) => (t.trim() === '' ? null : t.trim());

function number(text: string, label: string, options: { required: boolean; signed?: boolean }): Result<string | null, AppError> {
  const t = clean(text);
  if (t === '') return options.required ? err(validationError(`${label} is required`, { issues: [label] })) : ok(null);
  if (!isTypedNumber(t) || (!options.signed && dec(t).lte(0))) {
    return err(validationError(`${label} must be ${options.signed ? 'a number' : 'a positive number'}`, { issues: [label] }));
  }
  return ok(dec(t).toString());
}

/** A stop must sit on the losing side of the entry and a target on the winning side. */
function levelProblem(direction: 'buy' | 'sell', entry: string, stop: string | null, target: string | null): string | null {
  const e = dec(entry);
  const buy = direction === 'buy';
  if (stop && (buy ? dec(stop).gte(e) : dec(stop).lte(e))) return `For a ${buy ? 'buy' : 'sell'}, the stop loss must be ${buy ? 'below' : 'above'} the entry price`;
  if (target && (buy ? dec(target).lte(e) : dec(target).gte(e))) return `For a ${buy ? 'buy' : 'sell'}, the take profit must be ${buy ? 'above' : 'below'} the entry price`;
  return null;
}

/** A demo trade typed in by hand (spec §14.4), as a journal entry with its process score. */
export function manualToInput(f: ManualTradeForm, riskLimitPercent: number): Result<JournalEntryInput, AppError> {
  if (f.instrument.trim() === '') return err(validationError('Instrument is required', { issues: ['Instrument'] }));
  const fields = {
    size: number(f.size, 'Size', { required: true }),
    entry: number(f.entry, 'Entry price', { required: true }),
    stop: number(f.stop, 'Stop loss', { required: false }),
    target: number(f.target, 'Take profit', { required: false }),
    exit: number(f.exit, 'Exit price', { required: false }),
    result: number(f.result, 'Result', { required: false, signed: true }),
    plannedRisk: number(f.plannedRisk, 'Planned risk', { required: false }),
    equity: number(f.equity, 'Account equity', { required: false }),
  };
  for (const r of Object.values(fields)) if (!r.ok) return r;
  const v = Object.fromEntries(Object.entries(fields).map(([k, r]) => [k, r.ok ? r.value : null])) as Record<keyof typeof fields, string | null>;
  const levels = levelProblem(f.direction, v.entry as string, v.stop, v.target);
  if (levels) return err(validationError(levels, { issues: ['Stop loss'] }));
  if (v.plannedRisk && v.equity && dec(v.plannedRisk).gt(v.equity)) {
    return err(validationError('Planned risk cannot be more than the account equity', { issues: ['Planned risk'] }));
  }
  const pnlR = v.result && v.plannedRisk ? dec(v.result).div(v.plannedRisk).toDecimalPlaces(2).toString() : null;
  const input: JournalEntryInput = {
    source: 'manual',
    sourceRef: null,
    externalId: null,
    market: f.market,
    instrument: f.instrument.trim(),
    direction: f.direction,
    strategy: textOrNull(f.strategy),
    entry: v.entry as string,
    stop: v.stop,
    target: v.target,
    size: v.size as string,
    sizeUnit: f.sizeUnit.trim() || 'lots',
    exit: v.exit,
    pnlMoney: v.result,
    pnlPips: null,
    pnlR,
    plannedRisk: v.plannedRisk,
    costs: null,
    equityAtEntry: v.equity,
    openedAt: null,
    closedAt: null,
    conditions: textOrNull(f.conditions),
    entryRationale: textOrNull(f.entryRationale),
    exitRationale: textOrNull(f.exitRationale),
    emotion: f.emotion,
    ruleViolations: [...f.ruleViolations],
    noteBefore: null,
    noteAfter: null,
    screenshotUri: f.screenshotUri,
    processScore: null,
  };
  return ok({ ...input, processScore: processScore({ ...input, review: null }, riskLimitPercent).score });
}

export interface ImportPreviewRow {
  readonly trade: ImportedTrade;
  readonly duplicate: boolean;
}

export function importPreview(statement: ParsedStatement, existing: ReadonlySet<string>): readonly ImportPreviewRow[] {
  return statement.trades.map((trade) => ({ trade, duplicate: existing.has(trade.externalId) }));
}

/** An imported MT demo trade as a journal entry. The market is left for the learner to set; we do not guess it. */
export function importedToInput(t: ImportedTrade, sourceRef: string, riskLimitPercent: number): JournalEntryInput {
  const costs = t.commission.plus(t.swap);
  const input: JournalEntryInput = {
    source: 'mt_import',
    // The repository allows 80 characters; long Android file names are cut, not rejected.
    sourceRef: sourceRef.slice(0, 80),
    externalId: t.externalId,
    market: null,
    instrument: t.symbol,
    direction: t.side,
    strategy: null,
    entry: t.openPrice.toString(),
    stop: t.stopLoss ? t.stopLoss.toString() : null,
    target: t.takeProfit ? t.takeProfit.toString() : null,
    size: t.volume.toString(),
    sizeUnit: 'lots',
    exit: t.closePrice.toString(),
    pnlMoney: t.profit.plus(costs).toString(),
    pnlPips: null,
    pnlR: null,
    plannedRisk: null,
    costs: costs.toString(),
    equityAtEntry: null,
    openedAt: t.openTime,
    closedAt: t.closeTime,
    conditions: null,
    entryRationale: null,
    exitRationale: null,
    emotion: null,
    ruleViolations: [],
    noteBefore: null,
    noteAfter: 'Imported from MT statement. Times are the broker server time.',
    screenshotUri: null,
    processScore: null,
  };
  return { ...input, processScore: processScore({ ...input, review: null }, riskLimitPercent).score };
}

export interface ReviewForm {
  readonly thesis: string;
  readonly planVsActual: string;
  readonly rulesFollowed: boolean | null;
  readonly resultNote: string;
  readonly lesson: string;
  readonly nextGoal: string;
}

export const emptyReviewForm: ReviewForm = { thesis: '', planVsActual: '', rulesFollowed: null, resultNote: '', lesson: '', nextGoal: '' };

export function reviewFromForm(f: ReviewForm, now: UtcIso): Result<JournalReview, AppError> {
  if (f.rulesFollowed === null) return err(validationError('Say whether you followed your rules', { issues: ['rulesFollowed'] }));
  if (f.lesson.trim() === '') return err(validationError('Write one lesson', { issues: ['lesson'] }));
  return ok({
    thesis: f.thesis.trim(),
    planVsActual: f.planVsActual.trim(),
    rulesFollowed: f.rulesFollowed,
    resultNote: f.resultNote.trim(),
    lesson: f.lesson.trim(),
    nextGoal: f.nextGoal.trim(),
    reviewedAt: now,
  });
}

export function reviewToForm(entry: JournalEntry): ReviewForm {
  const r = entry.review;
  return r ? { ...r } : emptyReviewForm;
}

/** A trade time for display. Simulated trades carry made-up chart dates, so they are labelled as such. */
export function tradeTime(source: JournalSource, iso: string | null): string {
  if (iso === null) return 'not recorded';
  const t = iso.slice(0, 16).replace('T', ' ');
  if (SIMULATED_SOURCES.includes(source)) return `${t} (simulated chart time)`;
  return source === 'mt_import' ? `${t} (broker server time)` : t;
}
