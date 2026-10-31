import type { LocalDate } from '../../domain/learning/dates';
import { formatLocalDate } from './describe';
import type { LearnOverview, ModuleOverview } from './learnOverview';

/**
 * Pure view-model for the Learn tab's program hero and module cards (restyle brief §5.2). Counts come from the
 * overview (lessons ticked and checkpoints passed); the finish date only from the learner's program under way,
 * so a browsed or queued program never shows a date it does not have.
 */

export interface ProgramHeroView {
  /** Lessons done plus checkpoints passed. */
  readonly done: number;
  /** Every lesson plus one checkpoint per module (the same units Home counts). */
  readonly total: number;
  /** Whole percent, 0–100. */
  readonly percent: number;
  /**
   * "Finishes Thu 26 Nov 2026", only for the active program under way; "Planned finish Thu 22 Oct 2026 · behind
   * schedule" when that date has passed and classes are still left.
   */
  readonly finish: string | null;
  /** "Your program", "Your program · paused", "In your programs" or "Browsing". */
  readonly caption: string;
  /** What a screen reader says for the bar. */
  readonly spoken: string;
}

/** The program under way, as Home knows it. */
export interface CurrentProgram {
  readonly programId: string;
  readonly status: string;
  readonly finishDate: string | null;
  /** The learner's today (their zone), to tell a finish date that has already passed. */
  readonly today: string;
}

export function moduleUnitsDone(m: ModuleOverview): number {
  return m.lessons.filter((l) => l.done).length + (m.checkpointPassed ? 1 : 0);
}

export function programHeroView(overview: LearnOverview, current: CurrentProgram | null): ProgramHeroView {
  const total = overview.modules.reduce((n, m) => n + m.lessons.length + 1, 0);
  const done = overview.modules.reduce((n, m) => n + moduleUnitsDone(m), 0);
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  const mine = current !== null && current.programId === overview.programId;
  // A paused program has no finish date: nothing is scheduled while it is paused.
  const finish = mine && current.status === 'active' && current.finishDate ? finishText(current.finishDate, current.today, done >= total) : null;
  const caption = mine ? (current.status === 'paused' ? 'Your program · paused' : 'Your program') : overview.enrolled ? 'In your programs' : 'Browsing';
  const spoken = `Program progress, ${done} of ${total} lessons and checkpoints, ${percent} percent${finish ? `. ${finish}` : ''}`;
  return { done, total, percent, finish, caption, spoken };
}

/** The finish line; a past date with work left is labelled, never shown as if it were still the plan. */
export function finishText(finishDate: string, today: string, allDone: boolean): string {
  const date = formatLocalDate(finishDate as LocalDate);
  if (finishDate < today && !allDone) return `Planned finish ${date} · behind schedule`;
  return `Finishes ${date}`;
}

/** Lessons ticked in a module as a whole percent, for its bar. */
export function modulePercent(m: ModuleOverview): number {
  if (m.lessons.length === 0) return 0;
  return Math.round((m.lessons.filter((l) => l.done).length / m.lessons.length) * 100);
}
