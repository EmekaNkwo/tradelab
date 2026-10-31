import { BACKTEST_TEMPLATES, runBacktest, simulatedDataset, stepBacktest, type BacktestSetup } from '../../../domain/backtest';
import { budgetedPause, runBacktestSliced, SETUP_CANDLES_PER_STEP, yieldToEventLoop } from '../runner';
import { backtestSetup, defaultRunForm, runInputs } from '../setup';

/**
 * ADR 0006, Phase 12: data generation and the set-up before the first engine
 * slice (data checks, indicators) yield too, so no single blocking step runs
 * over the whole data set. Results stay identical.
 */

const TREND = BACKTEST_TEMPLATES.find((t) => t.strategyId === 'trend-following-moving-averages')!.definition;
const H1 = { ...TREND, timeframe: 'H1' as const };

function inputsFor(candles: number, seed = 5) {
  const form = defaultRunForm(H1, seed);
  const inputs = runInputs(H1, { ...form, candles: String(candles) }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  if (!inputs.ok) throw new Error(inputs.error[0]?.message);
  return inputs.value;
}

function setupFor(candles: number): BacktestSetup {
  const inputs = inputsFor(candles);
  const ds = simulatedDataset(inputs.dataset);
  if (!ds.ok) throw new Error(ds.error.message);
  const s = backtestSetup(H1, inputs, ds.value);
  if (!s.ok) throw new Error(s.error.message);
  return s.value;
}

/** Records the longest stretch of work between two pauses. */
function pauseTimer() {
  let last = performance.now();
  let longest = 0;
  let pauses = 0;
  return {
    pause: async () => {
      longest = Math.max(longest, performance.now() - last);
      pauses += 1;
      await yieldToEventLoop();
      last = performance.now();
    },
    finish: () => {
      longest = Math.max(longest, performance.now() - last);
      return { longest, pauses };
    },
  };
}

describe('the runner yields during set-up', () => {
  it('pauses many times before the first engine slice, and the result is unchanged', async () => {
    const setup = setupFor(26000);
    let pausesBeforeFirstSlice: number | null = null;
    let pauses = 0;
    const out = await runBacktestSliced(setup, {
      yieldToLoop: async () => {
        pauses += 1;
      },
      step: (state, max) => {
        if (pausesBeforeFirstSlice === null) pausesBeforeFirstSlice = pauses;
        return stepBacktest(state, max);
      },
    });
    if (!out.ok || out.value.kind !== 'done') throw new Error('did not finish');
    // Data checks and price reads in 26 chunks each, plus one step per indicator series.
    expect(pausesBeforeFirstSlice).toBeGreaterThanOrEqual(2 * Math.floor(26000 / SETUP_CANDLES_PER_STEP));
    const once = runBacktest(setup);
    expect(once.ok && once.value.fingerprint).toBe(out.value.result.fingerprint);
  }, 60000);

  it('can be cancelled during set-up', async () => {
    let pauses = 0;
    let slices = 0;
    const out = await runBacktestSliced(setupFor(26000), {
      yieldToLoop: async () => void (pauses += 1),
      isCancelled: () => pauses >= 5,
      step: (state, max) => {
        slices += 1;
        return stepBacktest(state, max);
      },
    });
    expect(out.ok && out.value.kind).toBe('cancelled');
    expect(slices).toBe(0);
  });

  /**
   * Timing. Before Phase 12 the set-up ran as one call of several hundred
   * milliseconds. Each step now covers at most `SETUP_CANDLES_PER_STEP`
   * candles (data checks, price reads) or one indicator series, and each
   * slice `CANDLES_PER_SLICE` candles. Wall-clock limits in milliseconds fail
   * on a busy CI machine, so the check is relative to the whole run; the
   * measured step times are in ADR 0006.
   */
  it('no stretch of work between pauses comes close to the whole run time', async () => {
    const setup = setupFor(26000);
    const timer = pauseTimer();
    const started = performance.now();
    const out = await runBacktestSliced(setup, { yieldToLoop: timer.pause });
    const total = performance.now() - started;
    const { longest } = timer.finish();
    expect(out.ok).toBe(true);
    // Before Phase 12 the set-up alone was one blocking call of a large share of the run.
    expect(longest).toBeLessThan(total / 5);
  }, 60000);
});

describe('budgeted pause', () => {
  it('yields to the event loop only once the time budget is used up', async () => {
    let now = 0;
    let real = 0;
    const pause = budgetedPause(12, () => now, async () => void (real += 1));
    await pause(); // 0 ms since start: no real yield
    now = 5;
    await pause();
    expect(real).toBe(0);
    now = 12;
    await pause();
    expect(real).toBe(1);
    now = 20; // 8 ms since the last real yield
    await pause();
    expect(real).toBe(1);
    now = 30;
    await pause();
    expect(real).toBe(2);
  });

  it('is what the runner uses by default, and the result is unchanged', async () => {
    const setup = setupFor(3000);
    const out = await runBacktestSliced(setup);
    const once = runBacktest(setup);
    expect(out.ok && out.value.kind === 'done' && out.value.result.fingerprint).toBe(once.ok && once.value.fingerprint);
  }, 60000);
});
