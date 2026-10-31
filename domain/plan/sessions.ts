/**
 * Market sessions clock (spec §20). Session hours are a convention, not
 * official hours: here each city's session is 08:00–17:00 in that city's own
 * time, so daylight saving moves with the city. The weekly forex market is
 * treated as closed from Friday 17:00 to Sunday 17:00 New York time.
 *
 * Pure apart from Intl time-zone data; the instant is passed in, never read.
 */

export type SessionId = 'sydney' | 'tokyo' | 'london' | 'new_york';

export interface MarketSession {
  readonly id: SessionId;
  readonly city: string;
  readonly timeZone: string;
  /** Currencies whose home market this is; pairs with them are often more active in these hours. */
  readonly currencies: readonly string[];
}

export const SESSIONS: readonly MarketSession[] = [
  { id: 'sydney', city: 'Sydney', timeZone: 'Australia/Sydney', currencies: ['AUD', 'NZD'] },
  { id: 'tokyo', city: 'Tokyo', timeZone: 'Asia/Tokyo', currencies: ['JPY'] },
  { id: 'london', city: 'London', timeZone: 'Europe/London', currencies: ['GBP', 'EUR', 'CHF'] },
  { id: 'new_york', city: 'New York', timeZone: 'America/New_York', currencies: ['USD', 'CAD'] },
];

export const SESSION_OPEN_HOUR = 8;
export const SESSION_CLOSE_HOUR = 17;
const NEW_YORK = 'America/New_York';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  /** 0 = Sunday. */
  readonly weekday: number;
}

const WEEKDAYS: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Building a formatter is slow on Hermes and one clock needs hundreds of lookups, so keep one per zone.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  formatters.set(timeZone, made);
  return made;
}

/** Wall-clock parts of `ms` in `timeZone` (formatToParts: engines order `format()` output differently). */
export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

/** The UTC instant of a wall-clock time in `timeZone` (two passes settle daylight-saving offsets). */
function zonedToUtc(year: number, month: number, day: number, hour: number, timeZone: string): number {
  const wall = Date.UTC(year, month - 1, day, hour);
  let guess = wall;
  for (let k = 0; k < 2; k += 1) {
    const p = zonedParts(guess, timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wall - shown;
  }
  return guess;
}

/** True while the weekly forex market is closed (Friday 17:00 to Sunday 17:00, New York time). */
export function forexWeekendAt(ms: number): boolean {
  const ny = zonedParts(ms, NEW_YORK);
  if (ny.weekday === 6) return true;
  if (ny.weekday === 5) return ny.hour >= SESSION_CLOSE_HOUR;
  if (ny.weekday === 0) return ny.hour < SESSION_CLOSE_HOUR;
  return false;
}

export interface SessionWindow {
  readonly openMs: number;
  readonly closeMs: number;
}

/** The weekly reopen (Sunday 17:00 New York) on or after `ms`. */
export function nextForexReopen(ms: number): number {
  const ny = zonedParts(ms, NEW_YORK);
  const sunday = new Date(Date.UTC(ny.year, ny.month - 1, ny.day + ((7 - ny.weekday) % 7)));
  const reopen = zonedToUtc(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), SESSION_CLOSE_HOUR, NEW_YORK);
  return reopen >= ms ? reopen : reopen + 7 * DAY;
}

/**
 * A window as the forex market allows it: one that starts during the weekend
 * starts at the reopen instead (Sydney's Monday morning is Sunday afternoon in
 * New York for part of the year), and one entirely inside the weekend is dropped.
 */
function tradable(w: SessionWindow): SessionWindow | null {
  if (!forexWeekendAt(w.openMs)) return w;
  const openMs = nextForexReopen(w.openMs);
  return openMs < w.closeMs ? { openMs, closeMs: w.closeMs } : null;
}

/** The session's tradable windows on the city-local days around `ms`, skipping the city's weekend. */
function windowsAround(s: MarketSession, ms: number): readonly SessionWindow[] {
  const out: SessionWindow[] = [];
  for (const offset of [-1, 0, 1, 2, 3, 4]) {
    const p = zonedParts(ms + offset * DAY, s.timeZone);
    if (p.weekday === 0 || p.weekday === 6) continue;
    const w = tradable({
      openMs: zonedToUtc(p.year, p.month, p.day, SESSION_OPEN_HOUR, s.timeZone),
      closeMs: zonedToUtc(p.year, p.month, p.day, SESSION_CLOSE_HOUR, s.timeZone),
    });
    if (w) out.push(w);
  }
  return out;
}

export interface SessionStatus {
  readonly session: MarketSession;
  readonly open: boolean;
  /** The window that is open now, or the next one to open. */
  readonly window: SessionWindow;
}

export function sessionStatus(s: MarketSession, ms: number): SessionStatus {
  const windows = windowsAround(s, ms);
  // Windows are already clipped to the forex week, so being inside one means the session is open.
  const current = windows.find((w) => w.openMs <= ms && ms < w.closeMs);
  if (current) return { session: s, open: true, window: current };
  const next = windows.find((w) => w.openMs > ms) ?? windows[windows.length - 1]!;
  return { session: s, open: false, window: next };
}

export interface SessionOverlap {
  readonly sessions: readonly [SessionId, SessionId];
  readonly window: SessionWindow;
}

/**
 * The current or next overlap of each pair of neighbouring sessions
 * (Sydney–Tokyo, Tokyo–London, London–New York), skipping the forex weekend.
 */
export function overlaps(ms: number): readonly SessionOverlap[] {
  const out: SessionOverlap[] = [];
  for (let k = 0; k + 1 < SESSIONS.length; k += 1) {
    const a = SESSIONS[k]!;
    const b = SESSIONS[k + 1]!;
    const candidates: SessionWindow[] = [];
    for (const wa of windowsAround(a, ms)) {
      for (const wb of windowsAround(b, ms)) {
        const openMs = Math.max(wa.openMs, wb.openMs);
        const closeMs = Math.min(wa.closeMs, wb.closeMs);
        if (closeMs > openMs && closeMs > ms) candidates.push({ openMs, closeMs });
      }
    }
    const first = candidates.sort((x, y) => x.openMs - y.openMs)[0];
    if (first) out.push({ sessions: [a.id, b.id], window: first });
  }
  return out;
}

export interface SessionsClock {
  readonly weekend: boolean;
  readonly statuses: readonly SessionStatus[];
  readonly overlaps: readonly SessionOverlap[];
}

export function sessionsClock(ms: number): SessionsClock {
  const statuses = SESSIONS.map((s) => sessionStatus(s, ms));
  return { weekend: forexWeekendAt(ms), statuses, overlaps: overlaps(ms) };
}

/** "HH:MM" in `timeZone`. */
export function clockTime(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** "Mon 14:00" in `timeZone`, for windows that may fall on another day. */
export function dayAndTime(ms: number, timeZone: string): string {
  return `${DAY_NAMES[zonedParts(ms, timeZone).weekday] ?? ''} ${clockTime(ms, timeZone)}`;
}
