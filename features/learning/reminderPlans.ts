import type { ReminderPlan, WeeklySlot } from '../../data';
import type { LearningReminderSettings } from '../../domain/models/learner';
import type { Enrolment } from '../../domain/models/learning';

/**
 * Learning reminders (spec §29): class time, spaced review, the weekly
 * summary and backups. None of them ever mentions trading, prices or markets
 * moving. They all depend on the class reminder being on, and the extra ones
 * are offset from class time so no two reminders ever fire at the same moment:
 * spaced review +1h on rest days, the summary +2h on Sunday, the backup +2h on
 * Saturday. An offset past midnight rolls over to the next day.
 */

export const SUMMARY_WEEKDAY = 0;
export const BACKUP_WEEKDAY = 6;
const REVIEW_OFFSET_HOURS = 1;
const SUMMARY_OFFSET_HOURS = 2;
const BACKUP_OFFSET_HOURS = 2;

export interface ReminderContext {
  readonly enrolment: Enrolment | null;
  readonly reminders: LearningReminderSettings;
  /** Review items due now, or missed before and still in the first two boxes. */
  readonly reviewsWaiting: number;
}

function classTimeOf(e: Enrolment): { hour: number; minute: number } {
  const [hour, minute] = (e.classTime ?? '0:0').split(':').map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
}

/** `hours` after class time on `weekday`, rolling over to the next day past midnight. */
export function offsetSlot(e: Enrolment, weekday: number, hours: number): WeeklySlot {
  const { hour, minute } = classTimeOf(e);
  const total = hour + hours;
  return { weekday: (weekday + Math.floor(total / 24)) % 7, hour: total % 24, minute };
}

/** Weekly reminders on study days at class time, or null when the learner turned them off. */
export function classReminderPlan(enrolment: Enrolment | null): ReminderPlan | null {
  if (!enrolment || enrolment.status !== 'active' || !enrolment.remindersEnabled || !enrolment.classTime) return null;
  const { hour, minute } = classTimeOf(enrolment);
  return {
    kind: 'class',
    title: "Time for today's class",
    body: 'Your TradeLab class is ready when you are.',
    slots: enrolment.settings.studyDays.map((weekday) => ({ weekday, hour, minute })),
  };
}

export function reminderPlans(ctx: ReminderContext): readonly ReminderPlan[] {
  const cls = classReminderPlan(ctx.enrolment);
  if (!cls || !ctx.enrolment) return [];
  const e = ctx.enrolment;
  const restDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !e.settings.studyDays.some((s) => s === d));
  // Rescheduled after every review and class, so it stops once nothing is waiting.
  const weak: ReminderPlan[] =
    ctx.reminders.weakReview && ctx.reviewsWaiting > 0 && restDays.length > 0
      ? [
          {
            kind: 'weak_review',
            title: 'A few earlier answers are due for another look',
            body: 'A five-minute spaced review on a rest day keeps them fresh.',
            slots: restDays.map((d) => offsetSlot(e, d, REVIEW_OFFSET_HOURS)),
          },
        ]
      : [];
  const summary: ReminderPlan[] = ctx.reminders.weeklySummary
    ? [
        {
          kind: 'weekly_summary',
          title: 'Your week in TradeLab',
          body: 'See what you learned this week and what to practise next.',
          slots: [offsetSlot(e, SUMMARY_WEEKDAY, SUMMARY_OFFSET_HOURS)],
        },
      ]
    : [];
  // Weekly whenever it is on: it has to fire even if the app is not opened, so its words hold whether or not a backup is due.
  const backup: ReminderPlan[] = ctx.reminders.backup
    ? [
        {
          kind: 'backup',
          title: 'Is your learning record backed up?',
          body: 'Your progress is kept only on this phone. If you have not saved a backup this month, save one from Settings.',
          slots: [offsetSlot(e, BACKUP_WEEKDAY, BACKUP_OFFSET_HOURS)],
        },
      ]
    : [];
  return [cls, ...weak, ...summary, ...backup];
}
