import type { Lesson, Module, Program, Question, Quiz } from '../../domain/models/content';
import type { ProgressReviewInput } from '../../domain/review';

/** The parts of bundled content the review needs, so it can be built without the repository. */
export interface ReviewContent {
  module(id: string): Module | null;
  lesson(id: string): Lesson | null;
  quiz(id: string): Quiz | null;
}

export type ReviewActivity = Pick<ProgressReviewInput, 'quizAttempts' | 'drillAttempts' | 'completedTaskIds' | 'practisedKinds' | 'journal'>;

/** Joins the program's content (modules, lessons, MT tasks, questions) with the learner's activity. */
export function reviewInput(content: ReviewContent, program: Program, activity: ReviewActivity): ProgressReviewInput {
  const modules = program.moduleIds.map((id) => content.module(id)).filter((m): m is Module => m !== null);
  const moduleTasks: Record<string, readonly string[]> = {};
  const lessonModule: Record<string, string> = {};
  const questions = new Map<string, Question>();
  for (const m of modules) {
    const lessons = m.lessonIds.map((id) => content.lesson(id)).filter((l): l is Lesson => l !== null);
    moduleTasks[m.id] = [...new Set(lessons.flatMap((l) => (l.doItNow.mtTaskId ? [l.doItNow.mtTaskId] : [])))];
    for (const l of lessons) {
      lessonModule[l.id] = m.id;
      for (const q of l.quickCheck) questions.set(q.id, q);
    }
    for (const q of content.quiz(m.checkpointQuizId)?.questions ?? []) questions.set(q.id, q);
  }
  return { modules, moduleTasks, lessonModule, questions, ...activity };
}
