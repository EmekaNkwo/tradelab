import { backtestProgress, backtestResult, createBacktestStepwise, FIRST_RUN, stepBacktest, type BacktestResult, type BacktestSetup, type RunContext } from '../../domain/backtest';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';

/**
 * Runs a backtest in slices so the screen stays responsive (ADR 0006). The
 * set-up (data checks and indicators) runs in steps of
 * `SETUP_CANDLES_PER_STEP` candles, then each engine slice processes `chunk`
 * candles and reports progress; the runner yields to the event loop after
 * every step and slice. Cancelling stops at the next pause. A throw anywhere
 * in the run becomes an error result, never an unhandled rejection.
 */

/** Small steps, so no single one blocks for long even on a slow phone; `budgetedPause` keeps the yields themselves cheap. */
export const CANDLES_PER_SLICE = 250;
export const SETUP_CANDLES_PER_STEP = 1000;
/** Work allowed between two real yields: under one 60 Hz frame. */
export const FRAME_BUDGET_MS = 12;

export type RunOutcome = { readonly kind: 'done'; readonly result: BacktestResult } | { readonly kind: 'cancelled' };

export interface RunOptions {
  readonly chunk?: number;
  readonly context?: RunContext;
  readonly onProgress?: (fraction: number) => void;
  readonly isCancelled?: () => boolean;
  /** Called after every set-up step and slice; defaults to `budgetedPause()`. Replaceable in tests. */
  readonly yieldToLoop?: () => Promise<void>;
  /** The engine step; replaceable in tests. */
  readonly step?: typeof stepBacktest;
}

export const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A pause that yields to the event loop only when `budgetMs` of work has run
 * since the last real yield. Steps stay small, but a fast device is not
 * slowed down by a timer after every one of them.
 */
export function budgetedPause(budgetMs: number = FRAME_BUDGET_MS, now: () => number = Date.now, yieldNow: () => Promise<void> = yieldToEventLoop): () => Promise<void> {
  let last = now();
  return async () => {
    if (now() - last < budgetMs) return;
    await yieldNow();
    last = now();
  };
}

export async function runBacktestSliced(setup: BacktestSetup, options: RunOptions = {}): Promise<Result<RunOutcome, AppError>> {
  const chunk = options.chunk ?? CANDLES_PER_SLICE;
  if (!Number.isInteger(chunk) || chunk < 1) return err(validationError('Slice size must be a whole number of candles'));
  const pause = options.yieldToLoop ?? budgetedPause();
  const step = options.step ?? stepBacktest;
  try {
    const steps = createBacktestStepwise(setup, SETUP_CANDLES_PER_STEP);
    let next = steps.next();
    while (!next.done) {
      await pause();
      if (options.isCancelled?.()) return ok({ kind: 'cancelled' });
      next = steps.next();
    }
    const created = next.value;
    if (!created.ok) return created;
    let state = created.value;
    options.onProgress?.(0);
    while (!state.done) {
      if (options.isCancelled?.()) return ok({ kind: 'cancelled' });
      state = step(state, chunk);
      options.onProgress?.(backtestProgress(state));
      await pause();
    }
    if (options.isCancelled?.()) return ok({ kind: 'cancelled' });
    return ok({ kind: 'done', result: backtestResult(state, options.context ?? FIRST_RUN) });
  } catch (cause) {
    logger.error('Backtest run failed', { cause: String(cause) });
    return err(fromUnknown('DataQualityError', 'The backtest failed', cause));
  }
}
