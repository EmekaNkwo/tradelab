import { addDays, localDateIn, weekdayOf, type LocalDate } from '../../domain/learning/dates';
import type { ProgressFacts } from '../../domain/progress';

/**
 * This week so far against the same point last week, for Home's "This week" tiles (restyle brief §5.1). Every
 * figure is counted from the same progress records the dashboard reads; nothing is estimated.
 *
 * Fair comparison: on Wednesday at 14:00 this week counts Monday 00:00 → now, and last week counts Monday 00:00 →
 * Wednesday 14:00 of last week, both on the learner's wall clock. Classes carry only a date, so they compare
 * Monday → today against Monday → the same weekday last week (whole days). A rate is shown only when the span has
 * something to divide by, and a rate change only when both spans do.
 */

export interface WeekLearning {
  /** Classes completed (local dates of completed classes). */
  readonly classes: number;
  /** Questions answered in lessons, classes and checkpoints, and how many were right. */
  readonly answered: number;
  readonly correct: number;
  /** Rule-checked trades in the journal, and how many broke no risk rule. */
  readonly checkedTrades: number;
  readonly withinRules: number;
  /** Replays finished. */
  readonly replays: number;
}

export interface WeekComparison {
  /** Monday of this week (learner's time zone). */
  readonly from: LocalDate;
  readonly thisWeek: WeekLearning;
  /** Last week up to the same weekday and time of day as now. */
  readonly lastWeek: WeekLearning;
}

/** Monday of the week containing `today` (the dashboard's week). */
export function weekStart(today: LocalDate): LocalDate {
  return addDays(today, -((weekdayOf(today) + 6) % 7));
}

/** End of day, used when no current time is known: whole days are compared. */
const END_OF_DAY = '23:59:59';

/** "HH:mm:ss" of `instant` on the learner's wall clock. */
/** One formatter per zone: building Intl formatters is slow on Hermes, and this runs once per record. */
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = timeFormatters.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone });
  timeFormatters.set(timeZone, made);
  return made;
}

export function localTime(instant: Date, timeZone: string): string {
  const parts = timeFormatter(timeZone).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}:${part('second')}`;
}

/** A wall-clock moment that sorts as text: "2026-10-28 14:00:00". */
type Stamp = string;
const stamp = (date: LocalDate, time: string): Stamp => `${date} ${time}`;

interface Span {
  readonly from: LocalDate;
  /** Last counted local date (inclusive), for date-only records. */
  readonly toDate: LocalDate;
  /** Last counted moment (inclusive), for timed records. */
  readonly until: Stamp;
}

function countIn(f: ProgressFacts, span: Span, timeZone: string): WeekLearning {
  const start = stamp(span.from, '00:00:00');
  const at = (iso: string) => {
    const instant = new Date(iso);
    const s = stamp(localDateIn(instant, timeZone), localTime(instant, timeZone));
    return s >= start && s <= span.until;
  };
  const answers = f.answers.filter((a) => at(a.at));
  const trades = f.checkedTrades.filter((t) => at(t.at));
  return {
    classes: f.classDates.filter((d) => d >= span.from && d <= span.toDate).length,
    answered: answers.length,
    correct: answers.filter((a) => a.correct).length,
    checkedTrades: trades.length,
    withinRules: trades.filter((t) => !t.ruleBroken).length,
    replays: f.replays.filter((r) => at(r.at)).length,
  };
}

/** Counts records from `from` (00:00) through `toDate` at `time` (inclusive), in the learner's zone. */
export function weekLearning(f: ProgressFacts, from: LocalDate, toDate: LocalDate, timeZone: string, time: string = END_OF_DAY): WeekLearning {
  return countIn(f, { from, toDate, until: stamp(toDate, time) }, timeZone);
}

/**
 * `now`: the device clock. Without it, whole days are compared (this week through today against last week through
 * the same weekday).
 */
export function weekComparison(f: ProgressFacts, today: LocalDate, timeZone: string, now?: Date): WeekComparison {
  const from = weekStart(today);
  const time = now ? localTime(now, timeZone) : END_OF_DAY;
  return {
    from,
    thisWeek: weekLearning(f, from, today, timeZone, time),
    lastWeek: weekLearning(f, addDays(from, -7), addDays(today, -7), timeZone, time),
  };
}

export interface WeekTile {
  readonly key: 'classes' | 'quiz' | 'rules' | 'replays';
  readonly caption: string;
  /** Display value: a count, a whole percent, or "–" when there is nothing to measure yet. */
  readonly value: string;
  /** What a screen reader says for the value. */
  readonly spoken: string;
  /** Change against the same point last week; null when it cannot be computed honestly. `text` is unsigned. */
  readonly change: { readonly delta: number; readonly text: string; readonly subject: string } | null;
}

/** How the comparison is named on screen and to screen readers. */
export const COMPARED_WITH = 'vs same point last week';

const NONE = '–';
const pct = (part: number, whole: number) => Math.round((part / whole) * 100);

function countTile(key: WeekTile['key'], caption: string, now: number, before: number): WeekTile {
  const delta = now - before;
  return { key, caption, value: String(now), spoken: `${caption} this week so far, ${now}`, change: { delta, text: String(Math.abs(delta)), subject: `${caption} ${COMPARED_WITH}` } };
}

function rateTile(key: WeekTile['key'], caption: string, part: number, whole: number, prevPart: number, prevWhole: number, empty: string): WeekTile {
  if (whole === 0) return { key, caption, value: NONE, spoken: `${caption} this week so far, ${empty}`, change: null };
  const now = pct(part, whole);
  const delta = prevWhole === 0 ? null : now - pct(prevPart, prevWhole);
  const change = delta === null ? null : { delta, text: `${Math.abs(delta)} pts`, subject: `${caption} ${COMPARED_WITH}, in percentage points` };
  return { key, caption, value: `${now}%`, spoken: `${caption} this week so far, ${now} percent, ${part} of ${whole}`, change };
}

/** The four tiles in order: classes attended, quiz accuracy, trades within rules, replays finished. */
export function weekTiles({ thisWeek: w, lastWeek: l }: WeekComparison): readonly WeekTile[] {
  return [
    countTile('classes', 'Classes attended', w.classes, l.classes),
    rateTile('quiz', 'Quiz accuracy', w.correct, w.answered, l.correct, l.answered, 'no questions answered yet'),
    rateTile('rules', 'Trades within rules', w.withinRules, w.checkedTrades, l.withinRules, l.checkedTrades, 'no checked trades yet'),
    countTile('replays', 'Replays finished', w.replays, l.replays),
  ];
}
