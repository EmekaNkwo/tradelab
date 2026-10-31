import { fnv1a } from '../../shared/hash';
import { createRng } from '../market/random';
import type { Question } from '../models/content';

/**
 * Options in a fixed, shuffled order per question (review Phase 6, H1).
 * Content authors tend to write the right answer first; showing the stored
 * order would let "always pick the first" pass a checkpoint. The order is
 * seeded by the question id, so it is the same on every visit and in tests,
 * and grading uses option ids, so it is unaffected.
 */
export function orderedOptions<O extends { readonly id: string }>(question: { readonly id: string; readonly options: readonly O[] }): readonly O[] {
  const rng = createRng(Number.parseInt(fnv1a(question.id), 16));
  const out = [...question.options];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** What a question card shows: shuffled options, and whether more than one answer is right. */
export function questionView<O extends { readonly id: string }>(
  q: Pick<Question, 'id' | 'prompt' | 'correctOptionIds'> & { readonly options: readonly O[] },
): { readonly id: string; readonly prompt: string; readonly options: readonly O[]; readonly multiple: boolean } {
  return { id: q.id, prompt: q.prompt, options: orderedOptions(q), multiple: q.correctOptionIds.length > 1 };
}
