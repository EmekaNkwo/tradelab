/**
 * Calendar dates in the learner's time zone, as "YYYY-MM-DD" strings.
 * Pure arithmetic (no clock, no time zone lookups): callers convert "now"
 * to a local date at the edge.
 */
declare const localDateBrand: unique symbol;
export type LocalDate = string & { readonly [localDateBrand]: true };

/** 0 = Sunday … 6 = Saturday (same as Date#getUTCDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isLocalDate(value: string): value is LocalDate {
  const m = PATTERN.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function toLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new RangeError(`Invalid local date "${value}"`);
  return value;
}

function toUtcMs(date: LocalDate): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10) as LocalDate;
}

export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function weekdayOf(date: LocalDate): Weekday {
  return new Date(toUtcMs(date)).getUTCDay() as Weekday;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** All dates from `start` to `end` inclusive that fall on one of `days`. */
export function studyDatesBetween(start: LocalDate, end: LocalDate, days: readonly Weekday[]): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = start; compareDates(d, end) <= 0; d = addDays(d, 1)) {
    if (days.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

/** The first `count` study dates on or after `start`. */
export function nextStudyDates(start: LocalDate, count: number, days: readonly Weekday[]): LocalDate[] {
  if (days.length === 0 || count <= 0) return [];
  const out: LocalDate[] = [];
  for (let d = start; out.length < count; d = addDays(d, 1)) {
    if (days.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

/** Converts an instant to the calendar date in `timeZone` (edge helper; uses Intl, no clock). */
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Building a formatter is slow, and progress converts many timestamps, so one is kept per time zone. */
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  formatters.set(timeZone, made);
  return made;
}

export function localDateIn(instant: Date, timeZone: string): LocalDate {
  // formatToParts, not format(): locale output order differs between JS engines (e.g. Hermes).
  const parts = dayFormatter(timeZone).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return toLocalDate(`${part('year')}-${part('month')}-${part('day')}`);
}
