import { compareDates, type LocalDate } from './dates';
import {
  anchorTimeline,
  buildUnits,
  DAILY_MINUTE_OPTIONS,
  planSchedule,
  type ScheduleModule,
  type SchedulePlan,
  type ScheduleSettings,
} from './scheduler';

/**
 * Behind / ahead status and catch-up options (spec §6.2). Progress is the set
 * of completed units; schedules are always rebuilt from what remains, so
 * changing settings never loses progress.
 */

export type ClassStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export interface ScheduledClassState {
  readonly date: LocalDate;
  readonly status: ClassStatus;
  readonly unitIds: readonly string[];
}

export type TimelineStatus =
  | { readonly kind: 'on_track' }
  | { readonly kind: 'behind'; readonly classesBehind: number }
  | { readonly kind: 'ahead'; readonly classesAhead: number };

export function timelineStatus(classes: readonly ScheduledClassState[], today: LocalDate): TimelineStatus {
  const overdue = classes.filter((c) => compareDates(c.date, today) < 0 && c.status !== 'completed').length;
  if (overdue > 0) return { kind: 'behind', classesBehind: overdue };
  const early = classes.filter((c) => compareDates(c.date, today) > 0 && c.status === 'completed').length;
  return early > 0 ? { kind: 'ahead', classesAhead: early } : { kind: 'on_track' };
}

export function remainingUnits(modules: readonly ScheduleModule[], completedUnitIds: ReadonlySet<string>): Set<string> {
  return new Set(buildUnits(modules).map((u) => u.id).filter((id) => !completedUnitIds.has(id)));
}

export type CatchUpChoice = 'extend_finish_date' | 'add_catch_up_class' | 'lengthen_classes';

export interface CatchUpOption {
  readonly choice: CatchUpChoice;
  readonly settings: ScheduleSettings;
  readonly plan: SchedulePlan;
}

/**
 * Previews of the three catch-up choices. None piles everything onto one day:
 * a catch-up class is one extra class today; lengthening uses the next
 * daily-minutes option that fits the original finish date.
 */
export function catchUpOptions(
  modules: readonly ScheduleModule[],
  current: ScheduleSettings,
  completedUnitIds: ReadonlySet<string>,
  today: LocalDate,
): CatchUpOption[] {
  const remaining = remainingUnits(modules, completedUnitIds);
  const fromToday: ScheduleSettings = { ...anchorTimeline(current, current.startDate), startDate: today };
  const option = (choice: CatchUpChoice, settings: ScheduleSettings): CatchUpOption => ({
    choice,
    settings,
    plan: planSchedule(modules, settings, remaining),
  });

  const extend = option('extend_finish_date', { ...fromToday, timeline: { kind: 'open' } });
  const catchUp = option('add_catch_up_class', { ...fromToday, extraDates: [...(current.extraDates ?? []), today] });
  const longerMinutes = DAILY_MINUTE_OPTIONS.find(
    (m) => m > current.dailyMinutes && !planSchedule(modules, { ...fromToday, dailyMinutes: m }, remaining).warnings.some((w) => w.kind === 'too_tight'),
  );
  const lengthen = longerMinutes ? [option('lengthen_classes', { ...fromToday, dailyMinutes: longerMinutes })] : [];
  return [extend, catchUp, ...lengthen];
}

/** Rebuilds the schedule from today with new settings, keeping completed work. */
export function rebuildSchedule(
  modules: readonly ScheduleModule[],
  settings: ScheduleSettings,
  completedUnitIds: ReadonlySet<string>,
  today: LocalDate,
): SchedulePlan {
  const start = compareDates(settings.startDate, today) > 0 ? settings.startDate : today;
  return planSchedule(modules, { ...anchorTimeline(settings, settings.startDate), startDate: start }, remainingUnits(modules, completedUnitIds));
}
