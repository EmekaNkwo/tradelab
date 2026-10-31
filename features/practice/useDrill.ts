import { useCallback, useMemo, useRef, useState } from 'react';
import { createDrill, DRILL_KINDS, gradeDrill, isNeutralAnswer, type Drill, type DrillKind, type DrillOption, type DrillResult } from '../../domain/market';
import type { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { ok } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery } from '../app';
import { toChartCandles, type ChartCandle } from './chartModel';
import { seedFrom } from './replaySession';

export const DRILL_INFO: Readonly<Record<DrillKind, { readonly title: string; readonly summary: string }>> = {
  find_the_trend: { title: 'Find the trend', summary: 'Read the direction of a whole chart.' },
  breakout_or_fake: { title: 'Breakout or fake?', summary: 'Commit before you see what happens next.' },
  where_is_the_stop: { title: "Where's the stop?", summary: 'Place the stop where the idea is proven wrong.' },
  size_it: { title: 'Size it', summary: 'Turn a risk limit and a stop into a position size.' },
};

/** What a screen may see before the learner commits: no answer key, feedback, or outcome. */
export interface DrillQuestion {
  readonly kind: DrillKind;
  readonly seed: number;
  readonly prompt: string;
  readonly options: readonly DrillOption[];
}

export interface DrillScreenState {
  readonly question: DrillQuestion;
  /** Candles to show: only those before the decision until the learner answers. */
  readonly candles: readonly ChartCandle[];
  readonly chosen: string | null;
  /** Set only after the learner commits. */
  readonly result: DrillResult | null;
}

/** One drill at a time; the answer is committed (and saved) before the rest of the chart is revealed. */
export function useDrill(kind: DrillKind, initialSeed?: number) {
  const c = useContainer();
  const [seed, setSeed] = useState(() => initialSeed ?? seedFrom(c.clock.now()));
  const [chosen, setChosen] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ readonly seed: number; readonly error: AppError } | null>(null);
  // A ref, not state: two taps in the same frame must record one answer.
  const answered = useRef<number | null>(null);
  const drill: Drill = useMemo(() => createDrill(kind, seed), [kind, seed]);
  const all = useMemo(() => toChartCandles(drill.scenario.candles), [drill]);

  const answer = useCallback(
    async (optionId: string) => {
      if (answered.current === seed) return;
      answered.current = seed;
      setChosen(optionId);
      const r = await c.practice.recordDrill({ kind, seed, optionId, correct: gradeDrill(drill, optionId).correct }, toUtcIso(c.clock.now()));
      if (!r.ok) {
        logger.warn('Drill answer not saved', { kind: r.error.kind });
        setSaveError({ seed, error: r.error });
      }
    },
    [c, drill, kind, seed],
  );

  const another = useCallback(() => {
    setChosen(null);
    setSeed((s) => (s * 48271) % 2147483647 || 1);
  }, []);

  const state: DrillScreenState = {
    question: { kind, seed, prompt: drill.prompt, options: drill.options },
    candles: chosen ? all : all.slice(0, drill.shownBefore),
    chosen,
    result: chosen ? gradeDrill(drill, chosen) : null,
  };
  // An error from an earlier drill's save is not shown on the next one.
  return { ...state, saveError: saveError?.seed === seed ? saveError.error : null, answer, another };
}

export interface DrillStats {
  readonly kind: DrillKind;
  /** Scored answers only; neutral choices such as waiting are counted separately. */
  readonly answered: number;
  readonly correct: number;
  readonly neutral: number;
}

export function useDrillStats() {
  const c = useContainer();
  return useLiveQuery(async () => {
    const r = await c.practice.drillTallies();
    if (!r.ok) return r;
    return ok<readonly DrillStats[]>(
      DRILL_KINDS.map((kind) => {
        const mine = r.value.filter((t) => t.kind === kind);
        const scored = mine.filter((t) => !isNeutralAnswer(kind, t.optionId));
        const sum = (rows: typeof mine, key: 'answered' | 'correct') => rows.reduce((n, t) => n + t[key], 0);
        return { kind, answered: sum(scored, 'answered'), correct: sum(scored, 'correct'), neutral: sum(mine, 'answered') - sum(scored, 'answered') };
      }),
    );
  }, ['drill_attempt']);
}

export const RECENT_REPLAYS = 5;

export function useReplayHistory() {
  const c = useContainer();
  return useLiveQuery(() => c.practice.replayAttempts(RECENT_REPLAYS), ['replay_attempt']);
}
