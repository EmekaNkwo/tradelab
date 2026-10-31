import { localDateIn } from '../../domain/learning/dates';
import { activityDate, type JournalEntry, type JournalSource } from '../../domain/models/journal';
import { dec } from '../../shared/decimal';

/**
 * Pure view-model for the journal list and entry (restyle brief §5.6). Everything here is read from the stored
 * entry: the badge from its source, the process chip only from what the entry records (rule breaks found by the
 * app or the learner, and the learner's own "did you follow your rules?" answer), the result from its own money
 * and R figures. Nothing is estimated.
 */

/** The SimulatedBadge kind for a source: replays and paper trades are simulated; hand-entered and imported trades are MT demo trades. */
export type JournalBadgeKind = 'replay' | 'paper' | 'demo';

export function badgeKindOf(source: JournalSource): JournalBadgeKind {
  if (source === 'replay') return 'replay';
  if (source === 'paper') return 'paper';
  return 'demo';
}

export interface ProcessChip {
  readonly kind: 'followed' | 'broke' | 'not_followed';
  /** Visible text, e.g. "Followed plan ✓" or "Broke 2 rules". */
  readonly text: string;
}

/** The process chip, or null when the entry records nothing about following the plan. */
export function processChip(e: Pick<JournalEntry, 'ruleViolations' | 'review'>): ProcessChip | null {
  const broken = e.ruleViolations.length;
  if (broken > 0) return { kind: 'broke', text: `Broke ${broken} ${broken === 1 ? 'rule' : 'rules'}` };
  if (e.review?.rulesFollowed === false) return { kind: 'not_followed', text: 'Plan not followed' };
  if (e.review?.rulesFollowed === true) return { kind: 'followed', text: 'Followed plan ✓' };
  return null;
}

export interface ResultView {
  /** Signed value as shown (two decimals), for the direction: positive is a gain. */
  readonly delta: number;
  /** Unsigned money, two decimals with thousands separators, e.g. "1,250.40". Journal money has no currency. */
  readonly amount: string;
  /** Unsigned R multiple to one decimal ("1.7R"), only when the entry has one. */
  readonly r: string | null;
}

/** "1,250.40" from a decimal string (no float rounding). */
export function groupedMoney(value: string): string {
  const [int = '0', frac = '00'] = dec(value).abs().toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

/** The trade's result for PnLValue, or null when no money result was recorded. */
export function resultView(e: Pick<JournalEntry, 'pnlMoney' | 'pnlR'>): ResultView | null {
  if (e.pnlMoney === null) return null;
  const shown = dec(e.pnlMoney).toFixed(2);
  return { delta: Number(shown), amount: groupedMoney(e.pnlMoney), r: e.pnlR === null ? null : `${dec(e.pnlR).abs().toFixed(1)}R` };
}

/** Unsigned R for the spoken label: "1.7R" → "1.7 R". */
export function spokenR(r: string): string {
  return r.replace(/R$/, ' R');
}

export interface JournalDay<T> {
  /** "2026-10-29" */
  readonly date: string;
  /** "Thu 29 Oct 2026" */
  readonly label: string;
  readonly entries: readonly T[];
}

/**
 * The day a trade belongs to: when the learner did it (`activityDate`) in their time zone. Imported trades keep
 * the broker server date, because their times are shown in broker server time.
 */
export function entryDay(e: Pick<JournalEntry, 'source' | 'closedAt' | 'createdAt'>, timeZone: string): string {
  const at = activityDate(e);
  // A broker close time is already in broker server time; without one, the import time is the learner's own.
  if (e.source === 'mt_import' && e.closedAt !== null) return e.closedAt.slice(0, 10);
  return localDateIn(new Date(at), timeZone);
}

export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** Entries grouped by day, keeping the list's order (newest first); a day appears once even if entries are interleaved. */
export function groupByDay<T extends Pick<JournalEntry, 'source' | 'closedAt' | 'createdAt'>>(entries: readonly T[], timeZone: string): readonly JournalDay<T>[] {
  const days = new Map<string, T[]>();
  for (const e of entries) {
    const key = entryDay(e, timeZone);
    days.set(key, [...(days.get(key) ?? []), e]);
  }
  return [...days.entries()].map(([date, list]) => ({ date, label: dayLabel(date), entries: list }));
}
