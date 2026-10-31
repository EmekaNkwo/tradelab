import {
  buildUnits,
  localDateIn,
  planSchedule,
  type LocalDate,
  type ScheduleModule,
  type SchedulePlan,
  type ScheduleSettings,
} from '../../domain/learning';
import type { DailyClass } from '../../domain/models/learning';
import type { ContentRepository } from '../../data';
import type { Clock } from '../../shared/time';

/** Maps a program's modules from content into scheduler input. Unknown ids are skipped (content validation forbids them). */
export function programModules(content: ContentRepository, programId: string): ScheduleModule[] {
  const program = content.program(programId);
  if (!program) return [];
  return program.moduleIds.flatMap((id) => {
    const m = content.module(id);
    return m
      ? [{ id: m.id, title: m.title, lessonIds: m.lessonIds, checkpointQuizId: m.checkpointQuizId, minPracticeDays: m.minPracticeDays }]
      : [];
  });
}

export function previewProgram(
  content: ContentRepository,
  programId: string,
  settings: ScheduleSettings,
  remaining: ReadonlySet<string> | null = null,
): SchedulePlan {
  return planSchedule(programModules(content, programId), settings, remaining);
}

export function todayIn(clock: Clock, timeZone: string): LocalDate {
  return localDateIn(clock.now(), timeZone);
}

/** Units still to schedule: not completed and not part of a class already under way. */
export function unscheduledUnits(
  modules: readonly ScheduleModule[],
  completed: ReadonlySet<string>,
  classes: readonly DailyClass[],
): Set<string> {
  const underway = new Set(classes.filter((c) => c.status === 'in_progress').flatMap((c) => c.unitIds));
  return new Set(buildUnits(modules).map((u) => u.id).filter((id) => !completed.has(id) && !underway.has(id)));
}

/**
 * Today's class: one already under way, else the earliest planned class due
 * today or earlier. Null when today's work is done (or nothing is due).
 */
export function todaysClass(classes: readonly DailyClass[], today: LocalDate): DailyClass | null {
  return (
    classes.find((c) => c.status === 'in_progress') ??
    classes.find((c) => c.status === 'planned' && c.date <= today) ??
    null
  );
}

/** The next class after today, which the learner may start early ("getting ahead"). */
export function nextClass(classes: readonly DailyClass[], today: LocalDate): DailyClass | null {
  return classes.find((c) => c.status === 'planned' && c.date > today) ?? null;
}

/**
 * Units in the program that are neither done nor in any class: content added
 * after the learner enrolled. They only reach the schedule when it is rebuilt.
 */
export function unitsInNoClass(modules: readonly ScheduleModule[], completed: ReadonlySet<string>, classes: readonly DailyClass[]): readonly string[] {
  const scheduled = new Set(classes.flatMap((c) => c.unitIds));
  return buildUnits(modules)
    .map((u) => u.id)
    .filter((id) => !completed.has(id) && !scheduled.has(id));
}
