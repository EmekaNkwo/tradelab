import { clockTime, dayAndTime, zonedParts, type SessionId, type SessionsClock } from '../../domain/plan';

/** One session's arc on the 24-hour dial, in the learner's time zone. */
export interface DialArc {
  readonly id: SessionId;
  readonly city: string;
  readonly open: boolean;
  /** Hour of day (0–24, fractional) where the arc starts. */
  readonly startHour: number;
  /** Arc length in hours (0–24): the window may be shortened by the forex weekend. */
  readonly hours: number;
  /** In words for screen readers: "09:00 to 18:00" when open; "opens Mon 08:00, until 17:00" for the next window. */
  readonly range: string;
}

export interface SessionsDialView {
  /** Hour of day (0–24, fractional) of the "Now" marker. */
  readonly nowHour: number;
  readonly nowLabel: string;
  readonly arcs: readonly DialArc[];
  /** The dial in words, for screen readers. */
  readonly summary: string;
}

/** Fractional hour of the day of `ms` in `timeZone`. */
export function hourOfDay(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  return p.hour + p.minute / 60;
}

/**
 * Arc length in hours, from the wall-clock times in the learner's zone, so a daylight-saving change inside the
 * window does not stretch or shrink the arc away from its drawn end. An empty or reversed window has no arc.
 */
export function arcHours(openMs: number, closeMs: number, timeZone: string): number {
  if (closeMs <= openMs) return 0;
  const hours = (hourOfDay(closeMs, timeZone) - hourOfDay(openMs, timeZone) + 24) % 24;
  return hours === 0 ? 24 : hours;
}

/**
 * The sessions clock as a 24-hour dial (brief §5.7): each session's current or next window as an arc, and the
 * "Now" marker from the injected clock. Display only; the windows come from `sessionsClock`.
 */
export function sessionsDialView(clock: SessionsClock, nowMs: number, timeZone: string): SessionsDialView {
  const arcs = clock.statuses.map((s): DialArc => ({
    id: s.session.id,
    city: s.session.city,
    open: s.open,
    startHour: hourOfDay(s.window.openMs, timeZone),
    hours: arcHours(s.window.openMs, s.window.closeMs, timeZone),
    range: s.open
      ? `${clockTime(s.window.openMs, timeZone)} to ${clockTime(s.window.closeMs, timeZone)}`
      : `opens ${dayAndTime(s.window.openMs, timeZone)}, until ${clockTime(s.window.closeMs, timeZone)}`,
  }));
  const nowLabel = dayAndTime(nowMs, timeZone);
  const sessions = arcs.map((a) => `${a.city}, ${a.open ? 'open' : 'closed'}, ${a.range}`).join('. ');
  const legend = 'Solid rings are open now; dashed rings show the next opening.';
  return {
    nowHour: hourOfDay(nowMs, timeZone),
    nowLabel,
    arcs,
    summary: `24-hour sessions dial in your time zone. Now ${nowLabel}${clock.weekend ? ', forex market closed for the weekend' : ''}. ${sessions}. ${legend}`,
  };
}
