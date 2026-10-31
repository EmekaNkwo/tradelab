import {
  addDays,
  diffDays,
  nextStudyDates,
  studyDatesBetween,
  type LocalDate,
  type Weekday,
} from './dates';

/**
 * Program scheduler (spec §6.2). Turns modules into ~15-minute class units and
 * spreads them over the learner's study days. Pure and deterministic: the
 * caller passes today's local date.
 */

export const UNIT_MINUTES = 15;
export const DAILY_MINUTE_OPTIONS = [10, 15, 20, 30, 45, 60, 90] as const;
export const WEEK_PRESETS = [2, 4, 8, 12, 16, 24] as const;
/** Spec §7.2: every 5th class is a review class. */
export const REVIEW_EVERY = 5;
/** Below this share of study days used, the plan is "thin" and a shorter one is suggested. */
const THIN_RATIO = 0.4;

export type UnitKind = 'lesson' | 'checkpoint';

export interface ClassUnit {
  readonly id: string;
  readonly moduleId: string;
  readonly kind: UnitKind;
  /** Lesson id or checkpoint quiz id. */
  readonly refId: string;
}

export interface ScheduleModule {
  readonly id: string;
  readonly title: string;
  readonly lessonIds: readonly string[];
  readonly checkpointQuizId: string;
  /** Practice modules (replay, backtest, paper, demo) keep at least this many distinct days. */
  readonly minPracticeDays: number;
}

export type Timeline =
  | { readonly kind: 'weeks'; readonly weeks: number }
  | { readonly kind: 'finishDate'; readonly date: LocalDate }
  /** No deadline: use as many study days as needed (used for "extend the finish date"). */
  | { readonly kind: 'open' };

export interface ScheduleSettings {
  readonly startDate: LocalDate;
  readonly timeline: Timeline;
  readonly studyDays: readonly Weekday[];
  readonly dailyMinutes: number;
  /** Extra non-study dates the learner chose to use (e.g. a catch-up class today). */
  readonly extraDates?: readonly LocalDate[];
}

export type ClassKind = 'lesson' | 'review' | 'checkpoint';

export interface PlannedClass {
  readonly index: number;
  readonly date: LocalDate;
  readonly kind: ClassKind;
  readonly moduleId: string | null;
  readonly unitIds: readonly string[];
  readonly minutes: number;
}

export type ScheduleWarning =
  | { readonly kind: 'too_tight'; readonly requiredClasses: number; readonly availableDays: number }
  | { readonly kind: 'too_thin'; readonly requiredClasses: number; readonly availableDays: number }
  | { readonly kind: 'practice_squeezed'; readonly moduleIds: readonly string[] }
  | { readonly kind: 'class_longer_than_minutes'; readonly unitMinutes: number }
  | { readonly kind: 'no_study_days' }
  | { readonly kind: 'nothing_to_schedule' };

export type ScheduleSuggestion =
  | { readonly kind: 'dailyMinutes'; readonly value: number }
  | { readonly kind: 'weeks'; readonly value: number }
  | { readonly kind: 'finishDate'; readonly value: LocalDate };

export interface SchedulePlan {
  readonly classes: readonly PlannedClass[];
  readonly totalClasses: number;
  readonly minutesPerClass: number;
  readonly finishDate: LocalDate | null;
  /** The deadline the learner asked for, if any. */
  readonly targetDate: LocalDate | null;
  readonly availableDays: number;
  readonly warnings: readonly ScheduleWarning[];
  readonly suggestions: readonly ScheduleSuggestion[];
}

export function unitsPerClass(dailyMinutes: number): number {
  return Math.max(1, Math.floor(dailyMinutes / UNIT_MINUTES));
}

export function buildUnits(modules: readonly ScheduleModule[]): ClassUnit[] {
  return modules.flatMap((m) => [
    ...m.lessonIds.map((lessonId) => ({ id: `${m.id}:${lessonId}`, moduleId: m.id, kind: 'lesson' as const, refId: lessonId })),
    { id: `${m.id}:checkpoint`, moduleId: m.id, kind: 'checkpoint' as const, refId: m.checkpointQuizId },
  ]);
}

interface ClassDraft {
  readonly kind: ClassKind;
  readonly moduleId: string | null;
  readonly unitIds: readonly string[];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Orders remaining units into class drafts: lessons packed per class, checkpoints alone, a review every 5th class. */
export function draftClasses(
  modules: readonly ScheduleModule[],
  remainingUnitIds: ReadonlySet<string> | null,
  dailyMinutes: number,
): ClassDraft[] {
  const capacity = unitsPerClass(dailyMinutes);
  const content: ClassDraft[] = modules.flatMap((m) => {
    const units = buildUnits([m]).filter((u) => !remainingUnitIds || remainingUnitIds.has(u.id));
    const lessons = units.filter((u) => u.kind === 'lesson');
    const checkpoint = units.find((u) => u.kind === 'checkpoint');
    const perDay =
      m.minPracticeDays > 0 ? Math.max(1, Math.min(capacity, Math.ceil(lessons.length / m.minPracticeDays))) : capacity;
    return [
      ...chunk(lessons, perDay).map((group) => ({ kind: 'lesson' as const, moduleId: m.id, unitIds: group.map((u) => u.id) })),
      ...(checkpoint ? [{ kind: 'checkpoint' as const, moduleId: m.id, unitIds: [checkpoint.id] }] : []),
    ];
  });

  const withReviews: ClassDraft[] = [];
  for (const draft of content) {
    if ((withReviews.length + 1) % REVIEW_EVERY === 0) withReviews.push({ kind: 'review', moduleId: null, unitIds: [] });
    withReviews.push(draft);
  }
  return withReviews;
}

export function timelineEnd(settings: ScheduleSettings): LocalDate | null {
  const t = settings.timeline;
  if (t.kind === 'weeks') return addDays(settings.startDate, t.weeks * 7 - 1);
  if (t.kind === 'finishDate') return t.date;
  return null;
}

function availableDates(settings: ScheduleSettings, needed: number): LocalDate[] {
  const end = timelineEnd(settings);
  const extras = (settings.extraDates ?? []).filter((d) => d >= settings.startDate);
  if (end === null) {
    // Open timeline: exactly the first `needed` dates, so the spread never skips study days.
    const base = nextStudyDates(settings.startDate, needed, settings.studyDays);
    return [...new Set([...extras, ...base])].sort().slice(0, Math.max(needed, extras.length));
  }
  return [...new Set([...extras, ...studyDatesBetween(settings.startDate, end, settings.studyDays)])].sort();
}

/**
 * Pins a length-in-weeks timeline to an absolute finish date counted from
 * `programStart`, so rebuilding from a later day never quietly restarts the
 * clock (a 12-week plan stays 12 weeks from when it began).
 */
export function anchorTimeline(settings: ScheduleSettings, programStart: LocalDate): ScheduleSettings {
  if (settings.timeline.kind !== 'weeks') return settings;
  return { ...settings, timeline: { kind: 'finishDate', date: addDays(programStart, settings.timeline.weeks * 7 - 1) } };
}

/** Spreads `count` classes across `dates`; if there are too few dates, continues on later study days. */
function assignDates(count: number, dates: readonly LocalDate[], settings: ScheduleSettings): LocalDate[] {
  if (count <= dates.length) {
    return Array.from({ length: count }, (_, i) => dates[Math.floor((i * dates.length) / count)] as LocalDate);
  }
  const lastAvailable = dates[dates.length - 1];
  const overflowStart = lastAvailable ? addDays(lastAvailable, 1) : settings.startDate;
  return [...dates, ...nextStudyDates(overflowStart, count - dates.length, settings.studyDays)];
}

function practiceSqueezed(modules: readonly ScheduleModule[], classes: readonly PlannedClass[]): string[] {
  return modules
    .filter((m) => m.minPracticeDays > 0)
    .filter((m) => new Set(classes.filter((c) => c.moduleId === m.id && c.kind === 'lesson').map((c) => c.date)).size < Math.min(m.minPracticeDays, m.lessonIds.length))
    .map((m) => m.id);
}

export function planSchedule(
  modules: readonly ScheduleModule[],
  settings: ScheduleSettings,
  remainingUnitIds: ReadonlySet<string> | null = null,
): SchedulePlan {
  const drafts = draftClasses(modules, remainingUnitIds, settings.dailyMinutes);
  const targetDate = timelineEnd(settings);
  const base = { minutesPerClass: settings.dailyMinutes, targetDate };

  if (settings.studyDays.length === 0) {
    return { ...base, classes: [], totalClasses: 0, finishDate: null, availableDays: 0, warnings: [{ kind: 'no_study_days' }], suggestions: [] };
  }
  if (drafts.length === 0) {
    return { ...base, classes: [], totalClasses: 0, finishDate: null, availableDays: 0, warnings: [{ kind: 'nothing_to_schedule' }], suggestions: [] };
  }

  const dates = availableDates(settings, drafts.length);
  const assigned = assignDates(drafts.length, dates, settings);
  const classes: PlannedClass[] = drafts.map((d, index) => ({ ...d, index, date: assigned[index] as LocalDate, minutes: settings.dailyMinutes }));

  const warnings: ScheduleWarning[] = [];
  if (drafts.length > dates.length) warnings.push({ kind: 'too_tight', requiredClasses: drafts.length, availableDays: dates.length });
  else if (drafts.length < dates.length * THIN_RATIO) warnings.push({ kind: 'too_thin', requiredClasses: drafts.length, availableDays: dates.length });
  const squeezed = practiceSqueezed(modules, classes);
  if (squeezed.length > 0) warnings.push({ kind: 'practice_squeezed', moduleIds: squeezed });
  if (settings.dailyMinutes < UNIT_MINUTES) warnings.push({ kind: 'class_longer_than_minutes', unitMinutes: UNIT_MINUTES });

  return {
    ...base,
    classes,
    totalClasses: classes.length,
    finishDate: classes[classes.length - 1]?.date ?? null,
    availableDays: dates.length,
    warnings,
    suggestions: suggest(modules, settings, remainingUnitIds, warnings),
  };
}

function fits(modules: readonly ScheduleModule[], settings: ScheduleSettings, remaining: ReadonlySet<string> | null): boolean {
  const needed = draftClasses(modules, remaining, settings.dailyMinutes).length;
  return needed <= availableDates(settings, needed).length;
}

/** The nearest realistic alternatives (spec §6.2). The learner decides; nothing is changed automatically. */
function suggest(
  modules: readonly ScheduleModule[],
  settings: ScheduleSettings,
  remaining: ReadonlySet<string> | null,
  warnings: readonly ScheduleWarning[],
): ScheduleSuggestion[] {
  const tight = warnings.some((w) => w.kind === 'too_tight');
  const thin = warnings.some((w) => w.kind === 'too_thin');
  if (!tight && !thin) return [];
  const out: ScheduleSuggestion[] = [];

  if (tight) {
    const minutes = DAILY_MINUTE_OPTIONS.find((m) => m > settings.dailyMinutes && fits(modules, { ...settings, dailyMinutes: m }, remaining));
    if (minutes) out.push({ kind: 'dailyMinutes', value: minutes });
  }
  const weeks = WEEK_PRESETS.find((w) => fits(modules, { ...settings, timeline: { kind: 'weeks', weeks: w } }, remaining));
  const currentWeeks = settings.timeline.kind === 'weeks' ? settings.timeline.weeks : null;
  if (weeks && weeks !== currentWeeks && (tight || (currentWeeks !== null && weeks < currentWeeks))) {
    out.push({ kind: 'weeks', value: weeks });
  }
  if (tight) {
    const open = planSchedule(modules, { ...settings, timeline: { kind: 'open' } }, remaining);
    if (open.finishDate) out.push({ kind: 'finishDate', value: open.finishDate });
  }
  return out;
}

export function weeksBetween(start: LocalDate, end: LocalDate): number {
  return Math.ceil((diffDays(start, end) + 1) / 7);
}
