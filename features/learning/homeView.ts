import { useEffect, useState } from 'react';
import type { DailyClass } from '../../domain/models/learning';
import { useContainer } from '../app';
import type { LearningHome } from './hooks';

/**
 * Pure view-model helpers for the Home header and Today's class hero (restyle brief §5.1). Everything comes from
 * the learning home and the injected device clock; nothing is invented.
 */

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/** 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening (late night counts as evening, not morning). */
export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The hour (0–23) of `instant` on the learner's wall clock. */
export function localHour(instant: Date, timeZone: string): number {
  const text = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(instant);
  const hour = Number.parseInt(text, 10);
  return Number.isFinite(hour) ? hour % 24 : 0;
}

/** How often a focused Home re-reads the clock; the greeting only changes at 05:00, 12:00 and 18:00. */
export const GREETING_REFRESH_MS = 60_000;

/**
 * The greeting for now, from the container's clock (so tests and the device agree on the time). Re-read whenever
 * Home is focused again and once a minute while it is, so a Home left open past noon stops saying "Good morning".
 */
export function useGreeting(timeZone: string, active = true): Greeting {
  const { clock } = useContainer();
  // Read on every render (a refocus re-renders Home); the timer only asks for a render while Home is focused.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), GREETING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active]);
  return greetingFor(localHour(clock.now(), timeZone));
}

export interface ClassPosition {
  /** 1-based place of the class in the program's schedule. */
  readonly number: number;
  readonly of: number;
}

/** "Class 17 of 64": the class's place among the scheduled classes; null if it is not in the schedule. */
export function classPosition(classes: readonly DailyClass[], cls: DailyClass): ClassPosition | null {
  const i = classes.findIndex((c) => c.id === cls.id);
  return i < 0 ? null : { number: i + 1, of: classes.length };
}

/** Share of the program's lessons and checkpoints done, 0–100. */
export function programPercent(home: Pick<LearningHome, 'completedUnits' | 'totalUnits'>): number {
  if (home.totalUnits <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((home.completedUnits / home.totalUnits) * 100)));
}

export interface DueSignal {
  /** True only when something is really known to be due: today's class not yet done, or reviews waiting. */
  readonly due: boolean;
  /** What a screen reader says for the bell. */
  readonly label: string;
}

export function dueSignal(home: Pick<LearningHome, 'todaysClass' | 'dueReviews'>): DueSignal {
  const parts = [
    home.todaysClass ? "today's class is waiting" : null,
    home.dueReviews > 0 ? `${home.dueReviews} ${home.dueReviews === 1 ? 'review is' : 'reviews are'} due` : null,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? { due: false, label: 'Reminders: nothing is due' } : { due: true, label: `Reminders: ${parts.join(', and ')}` };
}
