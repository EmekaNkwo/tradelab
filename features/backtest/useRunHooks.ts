import { useCallback, useEffect, useRef, useState } from 'react';
import { definitionIssues, withParameter, type BacktestResult, type SensitivityParameter } from '../../domain/backtest';
import type { BacktestRun, RunInputs, StrategyVersion } from '../../data';
import { fromUnknown, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer } from '../app';
import { budgetedPause, runBacktestSliced, type RunOutcome } from './runner';
import { backtestSetup } from './setup';

/**
 * Hooks that run the engine (ADR 0006): a new run, a rerun of a saved one,
 * and a sensitivity sweep. Each ignores a second start while one is in
 * flight, turns any thrown error into an error state, and stops updating
 * once the screen has gone.
 */

interface RecomputeOptions {
  readonly onProgress?: (f: number) => void;
  readonly isCancelled?: () => boolean;
}

/** Recomputes a run's result from its stored inputs: the same inputs always give the same result. */
function useRecompute() {
  const c = useContainer();
  return useCallback(
    async (version: StrategyVersion, inputs: RunInputs, options: RecomputeOptions = {}): Promise<Result<RunOutcome, AppError>> => {
      try {
        // Data is generated in steps too, sharing one frame budget and Cancel with the run (ADR 0006).
        const pause = budgetedPause();
        const dataset = await c.datasets.load(inputs.dataset, { pause, isCancelled: options.isCancelled });
        if (options.isCancelled?.()) return ok({ kind: 'cancelled' });
        if (!dataset.ok) return dataset;
        const setup = backtestSetup(version.definition, inputs, dataset.value);
        if (!setup.ok) return setup;
        return await runBacktestSliced(setup.value, { ...options, yieldToLoop: pause, context: { versionsTried: inputs.versionsTried, otherVersionsWithOutOfSample: inputs.otherVersionsWithOutOfSample } });
      } catch (cause) {
        logger.error('Backtest failed', { cause: String(cause) });
        return err(fromUnknown('DataQualityError', 'The backtest failed', cause));
      }
    },
    [c],
  );
}

/** Tracks whether the screen is still mounted. */
function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

export type RunnerState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly progress: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'done'; readonly run: BacktestRun };

/**
 * Runs a backtest with progress and Cancel, and saves the finished run.
 * Leaving the screen mid-run cancels it; leaving while it is being saved
 * still saves it.
 */
export function useBacktestRunner(): { readonly state: RunnerState; readonly start: (version: StrategyVersion, inputs: RunInputs) => Promise<void>; readonly cancel: () => void } {
  const c = useContainer();
  const recompute = useRecompute();
  const [state, setState] = useState<RunnerState>({ status: 'idle' });
  const mounted = useMounted();
  const cancelled = useRef(false);
  const inFlight = useRef(false);
  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );
  const start = useCallback(
    async (version: StrategyVersion, inputs: RunInputs) => {
      if (inFlight.current) return;
      inFlight.current = true;
      cancelled.current = false;
      const show = (s: RunnerState) => {
        if (mounted.current) setState(s);
      };
      try {
        show({ status: 'running', progress: 0 });
        const outcome = await recompute(version, inputs, { onProgress: (progress) => show({ status: 'running', progress }), isCancelled: () => cancelled.current });
        if (!outcome.ok) return show({ status: 'error', error: outcome.error });
        if (outcome.value.kind === 'cancelled') return show({ status: 'cancelled' });
        const saved = await c.backtests.saveRun(version.strategyId, version.version, inputs, outcome.value.result, toUtcIso(c.clock.now()));
        if (!saved.ok) {
          logger.warn('Saving a backtest run failed', { kind: saved.error.kind });
          return show({ status: 'error', error: saved.error });
        }
        show({ status: 'done', run: saved.value });
      } catch (cause) {
        logger.error('Backtest run failed', { cause: String(cause) });
        show({ status: 'error', error: fromUnknown('DataQualityError', 'The backtest failed', cause) });
      } finally {
        inFlight.current = false;
      }
    },
    [c, recompute, mounted],
  );
  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);
  return { state, start, cancel };
}

export type RecheckState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly progress: number }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'done'; readonly result: BacktestResult; readonly reproduced: boolean };

/** Reruns a stored run to show its trades and prove it gives the same answer. */
export function useRerun(run: BacktestRun | null, version: StrategyVersion | null) {
  const recompute = useRecompute();
  const [state, setState] = useState<RecheckState>({ status: 'idle' });
  const mounted = useMounted();
  const inFlight = useRef(false);
  const start = useCallback(async () => {
    if (!run || !version || inFlight.current) return;
    inFlight.current = true;
    const show = (s: RecheckState) => {
      if (mounted.current) setState(s);
    };
    try {
      show({ status: 'running', progress: 0 });
      const out = await recompute(version, run.inputs, { onProgress: (progress) => show({ status: 'running', progress }), isCancelled: () => !mounted.current });
      if (!out.ok) return show({ status: 'error', error: out.error });
      if (out.value.kind === 'done') show({ status: 'done', result: out.value.result, reproduced: out.value.result.fingerprint === run.result.fingerprint && out.value.result.inputHash === run.inputHash });
    } catch (cause) {
      show({ status: 'error', error: fromUnknown('DataQualityError', 'Repeating the backtest failed', cause) });
    } finally {
      inFlight.current = false;
    }
  }, [recompute, run, version, mounted]);
  return { state, start };
}

export interface SensitivityRow {
  readonly value: number;
  readonly isBase: boolean;
  /** Why the value could not be tested (it makes the rules invalid); the figures are then null. */
  readonly invalid: string | null;
  readonly trades: number | null;
  readonly expectancyR: number | null;
  readonly maxDrawdown: number | null;
}

export type SensitivityState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly done: number; readonly total: number }
  | { readonly status: 'error'; readonly error: AppError }
  | { readonly status: 'done'; readonly parameter: SensitivityParameter; readonly rows: readonly SensitivityRow[] };

const invalidRow = (value: number, isBase: boolean, reason: string): SensitivityRow => ({ value, isBase, invalid: reason, trades: null, expectancyR: null, maxDrawdown: null });

/**
 * Reruns one stored run with one setting moved to nearby values (spec §16.4).
 * A value that makes the rules invalid becomes an "n/a" row and the sweep
 * goes on. Variants are not saved as versions.
 */
export function useSensitivity(run: BacktestRun | null, version: StrategyVersion | null) {
  const recompute = useRecompute();
  const [state, setState] = useState<SensitivityState>({ status: 'idle' });
  const mounted = useMounted();
  const inFlight = useRef(false);
  const start = useCallback(
    async (parameter: SensitivityParameter) => {
      if (!run || !version || inFlight.current) return;
      inFlight.current = true;
      const show = (s: SensitivityState) => {
        if (mounted.current) setState(s);
      };
      try {
        const rows: SensitivityRow[] = [];
        for (const [k, value] of parameter.values.entries()) {
          if (!mounted.current) return;
          show({ status: 'running', done: k, total: parameter.values.length });
          const definition = withParameter(version.definition, parameter.id, value);
          const isBase = value === parameter.base;
          const problem = definitionIssues(definition)[0];
          if (problem) {
            rows.push(invalidRow(value, isBase, problem.message));
            continue;
          }
          const out = await recompute({ ...version, definition }, run.inputs, { isCancelled: () => !mounted.current });
          if (!out.ok && out.error.kind === 'ValidationError') {
            rows.push(invalidRow(value, isBase, out.error.message));
            continue;
          }
          if (!out.ok) return show({ status: 'error', error: out.error });
          if (out.value.kind === 'cancelled') return;
          const m = out.value.result.metrics;
          rows.push({ value, isBase, invalid: null, trades: m.trades, expectancyR: m.expectancyR, maxDrawdown: m.maxDrawdown });
        }
        show({ status: 'done', parameter, rows });
      } catch (cause) {
        show({ status: 'error', error: fromUnknown('DataQualityError', 'The sensitivity check failed', cause) });
      } finally {
        inFlight.current = false;
      }
    },
    [recompute, run, version, mounted],
  );
  return { state, start };
}
