import type { CatchUpChoice, LocalDate, ScheduleSuggestion, ScheduleWarning, TimelineStatus } from '../../domain/learning';

/** "1 class", "7 classes", "2 study days": words ending in s, x, ch or sh take "es". */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : /(s|x|ch|sh)$/.test(word) ? 'es' : 's'}`;

/** "Mon 2 Nov 2026". Local dates have no time zone, so format as UTC. */
export function formatLocalDate(date: LocalDate): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function describeWarning(w: ScheduleWarning, moduleTitle: (id: string) => string): string {
  switch (w.kind) {
    case 'too_tight':
      return `Too tight: this plan needs ${plural(w.requiredClasses, 'class')} but there are only ${plural(w.availableDays, 'study day')} before your date. Classes would run past it.`;
    case 'too_thin':
      return `Quite spread out: ${plural(w.requiredClasses, 'class')} over ${plural(w.availableDays, 'study day')}, so there will be long gaps between classes.`;
    case 'practice_squeezed':
      return `Practice needs real days: ${w.moduleIds.map(moduleTitle).join(', ')} cannot get its minimum practice days in this length.`;
    case 'class_longer_than_minutes':
      return `Each class unit takes about ${w.unitMinutes} minutes, so some classes will run longer than your daily time.`;
    case 'no_study_days':
      return 'Choose at least one study day.';
    case 'nothing_to_schedule':
      return 'Nothing left to schedule in this program.';
  }
}

export function describeSuggestion(s: ScheduleSuggestion): string {
  switch (s.kind) {
    case 'dailyMinutes':
      return `Use ${s.value} minutes a day`;
    case 'weeks':
      return `Make it ${plural(s.value, 'week')}`;
    case 'finishDate':
      return `Finish on ${formatLocalDate(s.value)}`;
  }
}

export function describeStatus(s: TimelineStatus): string {
  switch (s.kind) {
    case 'on_track':
      return 'On track';
    case 'behind':
      return `${plural(s.classesBehind, 'class')} behind`;
    case 'ahead':
      return `${plural(s.classesAhead, 'class')} ahead`;
  }
}

export const CATCH_UP_LABELS: Readonly<Record<CatchUpChoice, { title: string; body: string }>> = {
  extend_finish_date: { title: 'Extend the finish date', body: 'Keep one class per study day and finish later.' },
  add_catch_up_class: { title: 'Add a catch-up class today', body: 'One extra class today, then carry on as planned.' },
  lengthen_classes: { title: 'Lengthen upcoming classes', body: 'Longer classes so you still finish on time.' },
};

export const SECTION_TITLES = {
  warmup: 'Warm-up review',
  learn: 'Learn',
  watch: 'Worked example',
  practise: 'Practise',
  quiz: 'Recap quiz',
  checkpoint: 'Checkpoint',
  homework: 'Homework',
  summary: 'Summary',
} as const;
