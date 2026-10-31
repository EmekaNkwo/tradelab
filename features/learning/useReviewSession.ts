import { useCallback, useState } from 'react';
import type { Question } from '../../domain/models/content';
import { ok } from '../../shared/result';
import { useContainer, useLiveQuery } from '../app';
import { dueQuestionIds, finishReview } from './useCases';

export const REVIEW_SESSION_SIZE = 10;

/** A standalone spaced-repetition review of due concepts (spec §7.1 warm-up, §7.3 missions). */
export function useReviewSession() {
  const c = useContainer();
  // Loaded once: answering must not reshuffle the remaining questions.
  const due = useLiveQuery(async () => {
    const ids = await dueQuestionIds(c, REVIEW_SESSION_SIZE);
    return ids.ok ? ok(ids.value.map((id) => c.content.question(id)).filter((q): q is Question => q !== null)) : ids;
  }, []);
  const [answers, setAnswers] = useState<readonly { questionId: string; correct: boolean }[]>([]);
  const [saved, setSaved] = useState(false);

  const answer = useCallback((questionId: string, correct: boolean) => {
    setAnswers((a) => (a.some((x) => x.questionId === questionId) ? a : [...a, { questionId, correct }]));
  }, []);

  const save = useCallback(async () => {
    const r = await finishReview(c, answers);
    if (r.ok) setSaved(true);
    return r;
  }, [answers, c]);

  return { due, answers, answer, save, saved };
}
