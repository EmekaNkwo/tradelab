import { useCallback, useMemo, useRef, useState } from 'react';
import { labRecords, markPicks, type JudgedOption, type LabMark, type LabRecord } from '../../domain/labs';
import type { LabAttemptKind, LabConcept } from '../../domain/models/labs';
import type { AppError } from '../../shared/errors';
import { ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type QueryState } from '../app';

/** Best and latest score per red-flag case and market scenario. */
export function useLabRecords(): QueryState<ReadonlyMap<string, LabRecord>> {
  const c = useContainer();
  return useLiveQuery(async () => {
    const r = await c.labs.attempts();
    return r.ok ? ok(labRecords(r.value)) : r;
  }, ['lab_attempt']);
}

export function useLabConcepts(lab: LabConcept['lab']): readonly LabConcept[] {
  const c = useContainer();
  return useMemo(() => c.content.labConcepts(lab), [c, lab]);
}

export interface LabExercise {
  readonly picked: readonly string[];
  /** Set once the learner checks their answer. */
  readonly mark: LabMark | null;
  readonly saving: boolean;
  readonly error: AppError | null;
  toggle(id: string): void;
  check(): Promise<void>;
  reset(): void;
}

/**
 * A "pick all that apply" exercise. Checking marks every option and saves the
 * result; a failed save still shows the marking and reports the error.
 */
export function useLabExercise(kind: LabAttemptKind, refId: string, options: readonly JudgedOption[]): LabExercise {
  const c = useContainer();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [mark, setMark] = useState<LabMark | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const busy = useRef(false);

  const toggle = useCallback(
    (id: string) => {
      if (mark) return;
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    },
    [mark],
  );

  const check = useCallback(async () => {
    if (busy.current || mark) return;
    busy.current = true;
    setSaving(true);
    const m = markPicks(options, picked);
    setMark(m);
    const saved: Result<unknown, AppError> = await c.labs.record({ kind, refId, picked, score: m.score }, toUtcIso(c.clock.now()));
    setError(saved.ok ? null : saved.error);
    setSaving(false);
    busy.current = false;
  }, [c, kind, refId, options, picked, mark]);

  const reset = useCallback(() => {
    setPicked([]);
    setMark(null);
    setError(null);
  }, []);

  return { picked, mark, saving, error, toggle, check, reset };
}

/** Read-only lab content from the bundle. */
export function useLabContent() {
  const { content } = useContainer();
  return useMemo(
    () => ({
      concept: (id: string) => content.labConcept(id),
      companies: () => content.companies(),
      company: (id: string) => content.company(id),
      redFlagCases: () => content.redFlagCases(),
      redFlagCase: (id: string) => content.redFlagCase(id),
      scenarios: (category?: 'macro' | 'commodity') => content.marketScenarios(category),
      scenario: (id: string) => content.marketScenario(id),
      comparison: () => content.marketComparison(),
      lessonTitle: (id: string) => content.lesson(id)?.title ?? null,
    }),
    [content],
  );
}
