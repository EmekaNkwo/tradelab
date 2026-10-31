/**
 * Marks a "pick all that apply" lab exercise: the red-flag detector (pick the
 * warning signs) and market scenarios (pick the plausible reactions). Every
 * option is judged, so leaving a true answer unpicked costs as much as
 * picking a wrong one.
 */
export interface JudgedOption {
  readonly id: string;
  /** True when the option should be picked. */
  readonly expected: boolean;
}

export type OptionVerdict = 'found' | 'missed' | 'wrongly_picked' | 'rightly_left';

export interface LabMark {
  readonly verdicts: Readonly<Record<string, OptionVerdict>>;
  readonly correct: number;
  readonly total: number;
  /** correct ÷ total. */
  readonly score: number;
}

export function markPicks(options: readonly JudgedOption[], picked: readonly string[]): LabMark {
  const chosen = new Set(picked);
  const verdicts = Object.fromEntries(
    options.map((o): [string, OptionVerdict] => {
      const isPicked = chosen.has(o.id);
      if (o.expected) return [o.id, isPicked ? 'found' : 'missed'];
      return [o.id, isPicked ? 'wrongly_picked' : 'rightly_left'];
    }),
  );
  const correct = Object.values(verdicts).filter((v) => v === 'found' || v === 'rightly_left').length;
  return { verdicts, correct, total: options.length, score: options.length === 0 ? 0 : correct / options.length };
}

/** Best and latest scores per exercise, for "recorded performance" (spec §11). */
export interface LabRecord {
  readonly attempts: number;
  readonly best: number;
  readonly latest: number;
}

export function labRecords(attempts: readonly { readonly refId: string; readonly score: number; readonly answeredAt: string }[]): ReadonlyMap<string, LabRecord> {
  const newestFirst = [...attempts].sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
  const out = new Map<string, LabRecord>();
  for (const a of newestFirst) {
    const r = out.get(a.refId);
    out.set(a.refId, r ? { attempts: r.attempts + 1, best: Math.max(r.best, a.score), latest: r.latest } : { attempts: 1, best: a.score, latest: a.score });
  }
  return out;
}
