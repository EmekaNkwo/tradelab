import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReplayReview, ReplayState } from '../../domain/market';
import { dec } from '../../shared/decimal';
import type { AppError } from '../../shared/errors';
import { useContainer } from '../app';
import { applyAction, replayView, reviewUnsaved, saveReplay, seedFrom, startSession, type OrderForm, type ReplayAction, type ReplaySetup } from './replaySession';

export const REPLAY_SPEEDS: readonly { readonly ms: number; readonly label: string }[] = [
  { ms: 1500, label: 'Slow' },
  { ms: 700, label: 'Normal' },
  { ms: 250, label: 'Fast' },
];

/**
 * One replay run. Returns the view only: the engine state (with upcoming
 * candles) never leaves this hook.
 */
export function useReplay(setup: ReplaySetup) {
  const c = useContainer();
  const initial = useMemo(() => startSession(setup), [setup]);
  const [state, setState] = useState<ReplayState | null>(initial.ok ? initial.value : null);
  const [error, setError] = useState<AppError | null>(initial.ok ? null : initial.error);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(REPLAY_SPEEDS[1]!.ms);
  const [review, setReview] = useState<ReplayReview | null>(null);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(c.clock.now());

  // The latest state, read synchronously so an action's error is known at once
  // (a setState updater may run later, after the error would have been reported).
  const current = useRef(state);
  const commit = useCallback((next: ReplayState | null) => {
    current.current = next;
    setState(next);
  }, []);

  // Set while a finished replay is being saved: the replay is frozen so the saved record matches the screen.
  const savingRef = useRef(false);
  const stepBacks = useRef(0);

  const dispatch = useCallback(
    (action: ReplayAction): boolean => {
      const s = current.current;
      if (!s || savingRef.current) return false;
      const r = applyAction(s, action);
      if (r.ok) {
        commit(r.value);
        if (action.type === 'back' && r.value !== s) stepBacks.current += 1;
        // Playback stops at the last candle and on step back; it never restarts by itself.
        if (r.value.upcoming.length === 0 || action.type === 'back') setPlaying(false);
      }
      setError(r.ok ? null : r.error);
      return r.ok;
    },
    [commit],
  );

  const view = useMemo(() => (state ? replayView(state) : null), [state]);
  const finished = view?.finished ?? false;

  useEffect(() => {
    if (!playing || finished || review) return undefined;
    const timer = setInterval(() => dispatch({ type: 'next' }), speedMs);
    return () => clearInterval(timer);
  }, [dispatch, finished, playing, review, speedMs]);

  const restart = useCallback(() => {
    const again = startSession(setup);
    commit(again.ok ? again.value : null);
    setError(again.ok ? null : again.error);
    setReview(null);
    setPlaying(false);
    startedAt.current = c.clock.now();
    stepBacks.current = 0;
  }, [c.clock, commit, setup]);

  const finish = useCallback(
    async (note: string) => {
      const s = current.current;
      // A ref, not state: two taps in the same frame must not save two records.
      if (!s || savingRef.current) return;
      if (setup.data) {
        const reviewed = reviewUnsaved(setup, replayView(s), stepBacks.current);
        setPlaying(false);
        if (reviewed.ok) setReview(reviewed.value);
        else setError(reviewed.error);
        return;
      }
      savingRef.current = true;
      setPlaying(false);
      setSaving(true);
      const r = await saveReplay(c, setup, replayView(s), startedAt.current, note, stepBacks.current);
      savingRef.current = false;
      setSaving(false);
      if (r.ok) setReview(r.value.review);
      else setError(r.error);
    },
    [c, setup],
  );

  return {
    view,
    error,
    playing: playing && !finished && !review && !saving,
    speedMs,
    review,
    saving,
    next: () => dispatch({ type: 'next' }),
    back: () => dispatch({ type: 'back' }),
    cancelOrder: () => dispatch({ type: 'cancel' }),
    close: (fraction: '1' | '0.5') => dispatch({ type: 'close', fraction: dec(fraction) }),
    place: (form: OrderForm) => dispatch({ type: 'place', form }),
    edit: (stop: string, target: string) => dispatch({ type: 'edit', stop, target }),
    setPlaying: (on: boolean) => setPlaying(on && !savingRef.current),
    setSpeedMs,
    restart,
    finish,
    dismissError: () => setError(null),
  };
}

/** Makes a fresh seed from the app clock, for "new chart" and "random start". */
export function useSeedMaker(): () => number {
  const c = useContainer();
  return useCallback(() => seedFrom(c.clock.now()), [c.clock]);
}
