import { useCallback, useMemo, useRef, useState } from 'react';
import { gradeQuestions, gradeQuiz, type Answers } from '../../domain/learning';
import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer } from '../app';
import type { ClassSession } from './hooks';
import { finishClass, type ClassOutcome, type ClassResults, type LessonCheckResult } from './useCases';

interface Progress {
  readonly warmup: readonly { readonly questionId: string; readonly correct: boolean }[];
  /** First-attempt answers per question. */
  readonly firstAnswers: Answers;
  /** Questions eventually answered correctly. */
  readonly mastered: readonly string[];
  readonly checkpointAnswers: Answers;
}

const EMPTY: Progress = { warmup: [], firstAnswers: {}, mastered: [], checkpointAnswers: {} };

/**
 * Where to resume a paused class. Answers live in memory until the class is
 * finished, so a class never resumes past its quiz or checkpoint: the learner
 * redoes the quiz rather than finishing with no recorded answers.
 */
export function resumeSection(session: ClassSession): number {
  const lastIndex = session.sections.length - 1;
  const assessed = session.sections.findIndex((s) => s.kind === 'quiz' || s.kind === 'checkpoint');
  const done = Math.min(session.cls.sectionsDone, lastIndex);
  return assessed >= 0 ? Math.min(done, assessed) : done;
}

export function useClassRunner(session: ClassSession) {
  const c = useContainer();
  const [index, setIndex] = useState(() => resumeSection(session));
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [outcome, setOutcome] = useState<ClassOutcome | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = session.cls.status === 'completed';

  const begin = useCallback(async () => {
    if (readOnly || session.cls.status === 'in_progress') return;
    const r = await c.learning.startClass(session.cls.id, toUtcIso(c.clock.now()));
    if (!r.ok) setError(r.error);
  }, [c, readOnly, session.cls]);

  const goTo = useCallback(
    async (next: number) => {
      const bounded = Math.max(0, Math.min(next, session.sections.length - 1));
      setIndex(bounded);
      if (!readOnly) {
        const r = await c.learning.saveSectionProgress(session.cls.id, bounded);
        if (!r.ok) setError(r.error);
      }
    },
    [c, readOnly, session],
  );

  const answerWarmup = useCallback((questionId: string, correct: boolean) => {
    setProgress((p) => (p.warmup.some((w) => w.questionId === questionId) ? p : { ...p, warmup: [...p.warmup, { questionId, correct }] }));
  }, []);

  const answerFirst = useCallback((questionId: string, chosen: readonly string[]) => {
    setProgress((p) => (questionId in p.firstAnswers ? p : { ...p, firstAnswers: { ...p.firstAnswers, [questionId]: chosen } }));
  }, []);

  const markMastered = useCallback((questionId: string) => {
    setProgress((p) => (p.mastered.includes(questionId) ? p : { ...p, mastered: [...p.mastered, questionId] }));
  }, []);

  const answerCheckpoint = useCallback((questionId: string, chosen: readonly string[]) => {
    setProgress((p) => ({ ...p, checkpointAnswers: { ...p.checkpointAnswers, [questionId]: chosen } }));
  }, []);

  const retakeCheckpoint = useCallback(() => {
    setOutcome(null);
    setProgress((p) => ({ ...p, checkpointAnswers: {} }));
  }, []);

  const checkpointQuiz = session.checkpointQuizId ? c.content.quiz(session.checkpointQuizId) : null;

  const results = useMemo((): ClassResults => {
    const lessonChecks: LessonCheckResult[] = session.lessons.map((lesson) => {
      const firstAttempt = Object.fromEntries(lesson.quickCheck.map((q) => [q.id, progress.firstAnswers[q.id] ?? []]));
      return {
        lessonId: lesson.id,
        firstAttempt,
        firstResult: gradeQuestions(lesson.quickCheck, firstAttempt, 1),
        mastered: lesson.quickCheck.every((q) => progress.mastered.includes(q.id)),
      };
    });
    const checkpoint =
      checkpointQuiz && checkpointQuiz.questions.every((q) => q.id in progress.checkpointAnswers)
        ? { quizId: checkpointQuiz.id, answers: progress.checkpointAnswers, result: gradeQuiz(checkpointQuiz, progress.checkpointAnswers) }
        : null;
    return { warmup: progress.warmup, lessonChecks, checkpoint };
  }, [checkpointQuiz, progress, session.lessons]);

  const inFlight = useRef(false);
  const finish = useCallback(async (): Promise<Result<ClassOutcome, AppError> | null> => {
    if (readOnly || inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    const r = await finishClass(c, session.cls, results);
    inFlight.current = false;
    setBusy(false);
    if (r.ok) {
      setOutcome(r.value);
      // Warm-up and quiz results are saved now; a checkpoint retake must not submit them again.
      if (!r.value.finished) setProgress((p) => ({ ...EMPTY, checkpointAnswers: p.checkpointAnswers, mastered: p.mastered }));
    } else setError(r.error);
    return r;
  }, [c, readOnly, results, session.cls]);

  return {
    index,
    section: session.sections[index] ?? null,
    isLast: index >= session.sections.length - 1,
    readOnly,
    progress,
    results,
    outcome,
    error,
    busy,
    begin,
    goTo,
    answerWarmup,
    answerFirst,
    markMastered,
    answerCheckpoint,
    retakeCheckpoint,
    finish,
    dismissError: () => setError(null),
  };
}
