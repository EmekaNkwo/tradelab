import type { Lesson, PracticeKind } from '../models/content';
import type { PlannedClass } from './scheduler';

/**
 * Builds the ordered sections of one daily class (spec §7.1), scaled to the
 * learner's daily minutes. Short classes keep Learn, the quiz, and one short
 * task; longer ones add the worked example and more warm-up review.
 */

export type ClassSection =
  | { readonly kind: 'warmup'; readonly questionIds: readonly string[]; readonly minutes: number }
  | { readonly kind: 'learn'; readonly lessonId: string; readonly minutes: number }
  | { readonly kind: 'watch'; readonly lessonId: string; readonly minutes: number }
  | { readonly kind: 'practise'; readonly lessonId: string; readonly practice: PracticeKind; readonly minutes: number }
  | { readonly kind: 'quiz'; readonly lessonIds: readonly string[]; readonly minutes: number }
  | { readonly kind: 'checkpoint'; readonly quizId: string; readonly minutes: number }
  | { readonly kind: 'homework'; readonly lessonId: string; readonly minutes: number }
  | { readonly kind: 'summary'; readonly minutes: number };

export type SectionKind = ClassSection['kind'];

export interface ClassPlanInput {
  readonly plannedClass: PlannedClass;
  /** Lessons for the class's lesson units, in order. */
  readonly lessons: readonly Lesson[];
  /** Question ids due for spaced-repetition review, most urgent first. */
  readonly dueQuestionIds: readonly string[];
  /** Map from unit id to checkpoint quiz id for checkpoint units. */
  readonly checkpointQuizIds: readonly string[];
}

const SHORT_CLASS_MINUTES = 20;

function warmupSize(minutes: number, isReview: boolean): number {
  if (isReview) return Math.max(5, Math.floor(minutes / 2));
  return minutes <= SHORT_CLASS_MINUTES ? 2 : minutes <= 45 ? 3 : 5;
}

export function buildClassSections(input: ClassPlanInput): ClassSection[] {
  const { plannedClass: planned, lessons, dueQuestionIds } = input;
  const minutes = planned.minutes;
  const short = minutes <= SHORT_CLASS_MINUTES;
  const isReview = planned.kind === 'review';
  const warmupIds = dueQuestionIds.slice(0, warmupSize(minutes, isReview));
  const warmup: ClassSection[] = warmupIds.length > 0 ? [{ kind: 'warmup', questionIds: warmupIds, minutes: short ? 2 : 4 }] : [];

  if (planned.kind === 'checkpoint') {
    const quizId = input.checkpointQuizIds[0];
    return [...warmup, ...(quizId ? [{ kind: 'checkpoint' as const, quizId, minutes: Math.max(5, minutes - 2) }] : []), { kind: 'summary', minutes: 1 }];
  }
  if (isReview) {
    return [...warmup, { kind: 'summary', minutes: 1 }];
  }

  const perLesson = Math.max(5, Math.floor((minutes - (warmup.length ? 3 : 0) - 1) / Math.max(1, lessons.length)));
  const lessonSections = lessons.flatMap((lesson): ClassSection[] => [
    { kind: 'learn', lessonId: lesson.id, minutes: Math.max(3, Math.round(perLesson * 0.4)) },
    ...(short ? [] : [{ kind: 'watch' as const, lessonId: lesson.id, minutes: Math.max(2, Math.round(perLesson * 0.2)) }]),
    { kind: 'practise', lessonId: lesson.id, practice: lesson.doItNow.kind, minutes: Math.max(2, Math.round(perLesson * 0.25)) },
  ]);
  const quiz: ClassSection[] = lessons.length > 0 ? [{ kind: 'quiz', lessonIds: lessons.map((l) => l.id), minutes: short ? 2 : 4 }] : [];
  const homework: ClassSection[] = lessons
    .filter((l) => l.homework !== undefined)
    .slice(0, 1)
    .map((l) => ({ kind: 'homework', lessonId: l.id, minutes: 0 }));
  return [...warmup, ...lessonSections, ...quiz, ...homework, { kind: 'summary', minutes: 1 }];
}

/** Resume point after a pause: the first section not yet completed. */
export function resumeIndex(sections: readonly ClassSection[], completedSectionCount: number): number {
  return Math.min(Math.max(0, completedSectionCount), sections.length - 1);
}
