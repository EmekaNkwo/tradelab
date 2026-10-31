# ADR 0006: Run backtests in time slices on the JavaScript thread

**Status:** accepted (Phase 9), revised in Phase 12 so that set-up yields too. Timings must be confirmed on a physical phone (see Consequences).

**Context.** Spec §16.3 needs backtests over tens of thousands of candles, with progress and a Cancel button, and the screen must keep responding while one runs. The options considered:

- **Run the whole backtest in one call.** This is simplest, but it blocks the JavaScript thread for the whole run, so taps, Cancel and progress all freeze.
- **A worker thread or worklet** (for example, `react-native-worklets`, which Skia already needs). The engine uses `decimal.js` and the paper engine. Moving them into a worklet means serialising the whole state on every message, and it adds a second runtime to test.
- **Time slicing.** The engine is a pure step function, `stepBacktest(state, maxCandles)`. A feature-layer runner calls it for a fixed number of candles, reports progress, then yields to the event loop with `setTimeout(0)` before the next slice.

**Decision.** Use time slicing.

- `domain/backtest/engine.ts` stays pure and synchronous.
  - `createBacktest` validates the setup and precomputes every indicator series once.
  - `stepBacktest` advances a slice and returns a new state.
  - `backtestResult` builds the report.
- `features/backtest/runner.ts` (`runBacktestSliced`) runs 250 candles per slice (`CANDLES_PER_SLICE`; 1,000 before Phase 12).
  - It calls `onProgress` after each slice, and checks `isCancelled` at every pause.
  - Its yield function can be injected, so tests can count yields. By default it is `budgetedPause()`: steps stay small, but it only gives way to the event loop (`setTimeout(0)`) once 12 ms of work (`FRAME_BUDGET_MS`) has run since the last real yield, so a fast phone is not slowed by a timer after every step.
  - Any throw in the run (including in a slice) becomes an error result, logged, never an unhandled rejection.
- The hooks in `features/backtest/useRunHooks.ts` (new run, rerun, sensitivity) each ignore a second start while one is in flight, turn throws (such as a failing data load) into an error state, and stop updating once the screen unmounts. Leaving a new run mid-way cancels it; leaving while it is being saved still saves it.
- A slice-by-slice run gives exactly the same result as one call (tested by comparing fingerprints).

- **Set-up yields too (Phase 12).** The steps before the first slice are resumable step generators (`domain/backtest/stepwise.ts`, `Steps<T>`; `drainSteps` runs one in a single call). They stay pure: a generator only touches its own locals, so the stepped and one-call versions give the same output.
  - `simulatedDatasetStepwise` generates the simulated data about 250 candles at a time (`SIMULATED_CANDLES_PER_STEP` in `data/market/datasetSource.ts`). `DatasetSource.load(spec, { pause, isCancelled })` runs it with pauses; without options it runs in one call. Same seed, same candles.
  - `createBacktestStepwise` runs the data checks (`checkCandlesStepwise`) and the price reads for the indicators (`prepareSeriesStepwise`) 1,000 candles at a time (`SETUP_CANDLES_PER_STEP`), then each indicator series as one step. `createBacktest`, `checkCandles`, `prepareSeries` and `simulatedDataset` are the drained versions, so their results are unchanged.
  - `useRecompute` shares one budgeted pause and the Cancel flag between the data load and the run. Cancelling during set-up stops before the first slice.

**Measured (Node 20 on a laptop, 26,000 H1 candles, trend template; Phase 9).**

| Step | Time |
| --- | --- |
| Data generation | about 200 ms |
| Engine total | about 330 ms |
| Longest single slice | about 25 ms |
| Sliced run, end to end | about 440 ms |

**Measured again in Phase 12** (same laptop, under heavy load from other jobs, load average about 140, so only the medians mean much; 30,000 candles were similar):

| Step | Before (one call) | After: median step |
| --- | --- | --- |
| Data generation | 260–470 ms | 6–9 ms per 250 candles |
| Data checks and indicator set-up | 170–420 ms | about 5 ms per step (57 steps) |
| Engine slice | 25–45 ms per 1,000 candles | 9–12 ms per 250 candles |

`features/backtest/__tests__/runner.test.ts` checks the following:

- A 26,000-candle run finishes.
- It yields at least 25 times.
- A timer queued before the run gets to run during it.
- Progress only goes up, ending at 1.

The Phase 12 tests (`domain/backtest/__tests__/stepwise.test.ts`, `features/backtest/__tests__/slicedSetup.test.ts`, `data/market/__tests__/datasetSource.test.ts`) check the following:

- The stepped data, data checks (errors in the same order), indicator series and set-up equal the one-call versions, and a stepped run has the same result fingerprint.
- The runner pauses at least 52 times before the first engine slice on 26,000 candles, and can be cancelled during set-up without running a slice.
- The budgeted pause yields only once its budget is spent.
- No stretch of work between two pauses is more than a fifth of the whole run or load. The tests compare against the total rather than a fixed number of milliseconds, because a fixed limit fails on a busy CI machine.

**Consequences.**

- Each step must stay short on a phone. Phones are slower than a laptop. If one is 5× slower, a 250-candle slice takes about 50 ms, and each set-up step about 25 to 45 ms. If testing on a real phone shows jank, lower `CANDLES_PER_SLICE`, `SETUP_CANDLES_PER_STEP` or `SIMULATED_CANDLES_PER_STEP`; results do not depend on them.
- Real (imported or fetched) data is still checked and loaded in one call (`realDataset`). The data checks inside `createBacktest` are stepped for real data as well.
- One indicator series is one step. Over 30,000 candles that is a few milliseconds on a laptop. An indicator that becomes slow can be split the same way.
- A worker can still be added later behind `runBacktestSliced` without changing the domain engine.
