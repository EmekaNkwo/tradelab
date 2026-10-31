import type { Question, Quiz } from '../models/content';

/** Grades quiz answers with per-question feedback (spec §7.1 recap, §8.2 checkpoints). */

export type Answers = Readonly<Record<string, readonly string[]>>;

export interface QuestionResult {
  readonly questionId: string;
  readonly correct: boolean;
  readonly chosen: readonly string[];
  readonly correctOptionIds: readonly string[];
  /** Explanations for the options chosen, then for the correct ones not chosen. */
  readonly feedback: readonly string[];
}

export interface QuizResult {
  readonly score: number;
  readonly correctCount: number;
  readonly total: number;
  readonly passed: boolean;
  readonly results: readonly QuestionResult[];
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function gradeQuestion(question: Question, chosen: readonly string[]): QuestionResult {
  const unique = [...new Set(chosen)];
  const correct = sameSet(unique, question.correctOptionIds);
  const explain = (ids: readonly string[]) =>
    question.options.filter((o) => ids.includes(o.id)).map((o) => o.explanation);
  const missed = question.correctOptionIds.filter((id) => !unique.includes(id));
  return {
    questionId: question.id,
    correct,
    chosen: unique,
    correctOptionIds: question.correctOptionIds,
    feedback: [...explain(unique), ...(correct ? [] : explain(missed))],
  };
}

export function gradeQuestions(questions: readonly Question[], answers: Answers, passMark: number): QuizResult {
  const results = questions.map((q) => gradeQuestion(q, answers[q.id] ?? []));
  const correctCount = results.filter((r) => r.correct).length;
  const total = questions.length;
  const score = total === 0 ? 0 : correctCount / total;
  return { score, correctCount, total, passed: total > 0 && score >= passMark - 1e-9, results };
}

export function gradeQuiz(quiz: Quiz, answers: Answers): QuizResult {
  return gradeQuestions(quiz.questions, answers, quiz.passMark);
}
