import { addDays, weekdayOf, type LocalDate, type Weekday } from '../learning/dates';

/**
 * Study streak (spec §29), optional in Settings. It counts the learner's study
 * days in a row with a class completed. Days that are not study days are rest
 * days and never break it, and today does not break it until the day is over.
 * A missed study day ends the streak; it never costs anything else.
 */

export const STREAK_LOOKBACK_DAYS = 400;

export interface Streak {
  readonly current: number;
  /** True once today's class is done. */
  readonly doneToday: boolean;
  readonly todayIsStudyDay: boolean;
}

export function studyStreak(classDates: readonly LocalDate[], studyDays: readonly Weekday[], today: LocalDate): Streak {
  const done = new Set(classDates);
  const study = new Set(studyDays);
  const todayIsStudyDay = study.has(weekdayOf(today));
  const doneToday = done.has(today);
  if (study.size === 0) return { current: 0, doneToday, todayIsStudyDay };
  let current = doneToday ? 1 : 0;
  let day = addDays(today, -1);
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i += 1, day = addDays(day, -1)) {
    // A class done on a rest day still counts.
    if (done.has(day)) {
      current += 1;
      continue;
    }
    if (study.has(weekdayOf(day))) break;
  }
  return { current, doneToday, todayIsStudyDay };
}
