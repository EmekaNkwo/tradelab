import {
  addDays,
  DAILY_MINUTE_OPTIONS,
  WEEK_PRESETS,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type LocalDate,
  type Weekday,
} from '../../domain/learning';
import { formatLocalDate } from './describe';

export type TimelineChoice = { readonly kind: 'weeks'; readonly weeks: number } | { readonly kind: 'finishDate'; readonly date: LocalDate };

export interface ScheduleDraft {
  readonly timeline: TimelineChoice;
  readonly studyDays: readonly Weekday[];
  readonly dailyMinutes: number;
  readonly classTime: string | null;
}

export const CLASS_TIME_OPTIONS = ['06:30', '07:00', '12:30', '18:00', '19:00', '20:00', '21:00'] as const;
/** Monday first, as learners read a week. */
const DAY_ORDER: readonly Weekday[] = [...WEEKDAYS.slice(1), 0];
/** A finish date must leave at least one week. */
export const MIN_DAYS_TO_FINISH = 7;

/** Binds a schedule draft to the ScheduleFields component props. */
export function scheduleFieldProps(draft: ScheduleDraft, set: (patch: Partial<ScheduleDraft>) => void, today: LocalDate) {
  const minFinish = addDays(today, MIN_DAYS_TO_FINISH);
  const finishDate = draft.timeline.kind === 'finishDate' ? draft.timeline.date : addDays(today, draft.timeline.weeks * 7 - 1);
  return {
    timelineMode: draft.timeline.kind,
    onTimelineMode: (mode: 'weeks' | 'finishDate') =>
      set({ timeline: mode === 'weeks' ? { kind: 'weeks', weeks: 12 } : { kind: 'finishDate', date: finishDate < minFinish ? minFinish : finishDate } }),
    finishDateLabel: formatLocalDate(finishDate),
    onShiftFinishDate: (days: number) => {
      const next = addDays(finishDate, days);
      set({ timeline: { kind: 'finishDate', date: next < minFinish ? minFinish : next } });
    },
    weeks: draft.timeline.kind === 'weeks' ? draft.timeline.weeks : null,
    weekOptions: WEEK_PRESETS,
    onWeeks: (weeks: number) => set({ timeline: { kind: 'weeks', weeks } }),
    studyDays: draft.studyDays,
    dayLabels: DAY_ORDER.map((d) => ({ value: d as number, label: WEEKDAY_LABELS[d] })),
    onStudyDays: (days: number[]) => set({ studyDays: days.filter((d): d is Weekday => WEEKDAYS.includes(d as Weekday)) }),
    dailyMinutes: draft.dailyMinutes,
    minuteOptions: DAILY_MINUTE_OPTIONS,
    onDailyMinutes: (dailyMinutes: number) => set({ dailyMinutes }),
    classTime: draft.classTime,
    classTimeOptions: CLASS_TIME_OPTIONS,
    onClassTime: (classTime: string | null) => set({ classTime }),
  };
}
