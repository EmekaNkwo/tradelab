import { addDays, compareDates, type LocalDate } from './dates';

/**
 * Leitner-style spaced repetition (spec §7.1 warm-up, §23). A concept moves
 * up a box when recalled correctly and back to box 1 when missed; higher
 * boxes are reviewed less often.
 */
export const BOX_INTERVAL_DAYS = [1, 2, 4, 8, 16, 32] as const;
export const MAX_BOX = BOX_INTERVAL_DAYS.length;

export interface ReviewItem {
  /** Stable content id: a lesson, glossary term, or question id. */
  readonly conceptId: string;
  readonly box: number;
  readonly dueDate: LocalDate;
  readonly lapses: number;
  /**
   * Set when the item was brought forward for targeted practice: the date it
   * was really scheduled for. Null or absent otherwise.
   */
  readonly earlyFrom?: LocalDate | null;
}

/** The date an item is really scheduled for, ignoring any bring-forward. */
export const scheduledDate = (item: ReviewItem): LocalDate => item.earlyFrom ?? item.dueDate;

/** True when a review today is a genuine spaced re-test: the item was scheduled for today or earlier. */
export const isGenuinelyDue = (item: ReviewItem, today: LocalDate): boolean => compareDates(scheduledDate(item), today) <= 0;

export function newReviewItem(conceptId: string, today: LocalDate): ReviewItem {
  return { conceptId, box: 1, dueDate: addDays(today, BOX_INTERVAL_DAYS[0]), lapses: 0 };
}

/**
 * Makes these concepts due today (targeted practice, spec §23), keeping their
 * box and lapses and remembering the real schedule in `earlyFrom`; concepts
 * not yet in the queue join it in box 1. Only items that change are returned.
 */
export function bringForward(items: readonly ReviewItem[], conceptIds: readonly string[], today: LocalDate): ReviewItem[] {
  const byId = new Map(items.map((i) => [i.conceptId, i]));
  return [...new Set(conceptIds)].flatMap((id) => {
    const item = byId.get(id);
    if (!item) {
      const fresh = newReviewItem(id, today);
      return [{ ...fresh, dueDate: today, earlyFrom: fresh.dueDate }];
    }
    return compareDates(item.dueDate, today) > 0 ? [{ ...item, dueDate: today, earlyFrom: scheduledDate(item) }] : [];
  });
}

/**
 * Records one review. The rule for reviews before an item's real schedule
 * (brought forward, or met again in a lesson before it is due):
 * - right: no promotion. The box and the real scheduled date stay as they were,
 *   so practising early can never move an item up faster than its schedule;
 * - wrong: a lapse as usual (box 1, due tomorrow), because a miss is real evidence.
 * A review on or after the scheduled date moves the box up or back to 1 as usual.
 */
export function recordReview(item: ReviewItem, correct: boolean, today: LocalDate): ReviewItem {
  if (correct && !isGenuinelyDue(item, today)) return { ...item, dueDate: scheduledDate(item), earlyFrom: null };
  const box = correct ? Math.min(item.box + 1, MAX_BOX) : 1;
  return {
    ...item,
    box,
    dueDate: addDays(today, BOX_INTERVAL_DAYS[box - 1] ?? BOX_INTERVAL_DAYS[0]),
    lapses: correct ? item.lapses : item.lapses + 1,
    earlyFrom: null,
  };
}

/**
 * How a spaced re-test is stored in a `review` quiz attempt: ["correct"] or
 * ["incorrect"], plus "early" when the item was not genuinely due (brought
 * forward). Early re-tests update the queue but are not retention evidence.
 */
export const EARLY_REVIEW_MARK = 'early';

export function encodeReviewAnswer(correct: boolean, genuinelyDue: boolean): readonly string[] {
  return [correct ? 'correct' : 'incorrect', ...(genuinelyDue ? [] : [EARLY_REVIEW_MARK])];
}

export function decodeReviewAnswer(stored: readonly string[]): { readonly correct: boolean; readonly genuinelyDue: boolean } {
  return { correct: stored[0] === 'correct', genuinelyDue: !stored.includes(EARLY_REVIEW_MARK) };
}

/** Due items, most overdue and most-missed first. */
export function dueItems(items: readonly ReviewItem[], today: LocalDate, limit: number): ReviewItem[] {
  return items
    .filter((i) => compareDates(i.dueDate, today) <= 0)
    .sort((a, b) => compareDates(a.dueDate, b.dueDate) || b.lapses - a.lapses || a.conceptId.localeCompare(b.conceptId))
    .slice(0, Math.max(0, limit));
}
