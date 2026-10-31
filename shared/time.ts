/**
 * Time helpers. All timestamps are stored as UTC ISO-8601 strings and displayed
 * in the learner's time zone. Domain code never reads the clock; callers pass
 * "now" in (spec §32A.6).
 */
declare const utcIsoBrand: unique symbol;
export type UtcIso = string & { readonly [utcIsoBrand]: true };

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const fixed = new Date(iso);
  return { now: () => new Date(fixed.getTime()) };
}

const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export function toUtcIso(date: Date): UtcIso {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('toUtcIso received an invalid Date');
  }
  return date.toISOString() as UtcIso;
}

export function isUtcIso(value: string): value is UtcIso {
  return UTC_ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/** Default learner time zone: West Africa Time (spec §2). */
export const DEFAULT_TIME_ZONE = 'Africa/Lagos';

/** Formats a stored UTC timestamp in the learner's time zone, e.g. "29 Oct 2026, 11:00". */
export function formatInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The phone's time zone, if it is a valid IANA zone; otherwise the app default. */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
