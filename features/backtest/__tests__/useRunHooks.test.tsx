import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BACKTEST_TEMPLATES, type StrategyDefinition } from '../../../domain/backtest';
import type { BacktestRun, RunInputs, StrategyVersion } from '../../../data';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { defaultRunForm, runInputs } from '../setup';
import { useBacktestRunner, useRerun, useSensitivity } from '../useRunHooks';

/** A gate the runner waits on between slices, so a test can act mid-run. */
const gate = { waiting: [] as (() => void)[], throwInStep: false };
const releaseAll = () => {
  const all = gate.waiting.splice(0);
  for (const r of all) r();
};

jest.mock('../runner', () => {
  const actual = jest.requireActual('../runner');
  const engine = jest.requireActual('../../../domain/backtest');
  return {
    ...actual,
    runBacktestSliced: (setup: unknown, options: Record<string, unknown>) =>
      actual.runBacktestSliced(setup, {
        ...options,
        chunk: 500,
        yieldToLoop: () => new Promise<void>((resolve) => gate.waiting.push(resolve)),
        step: (s: unknown, n: number) => {
          if (gate.throwInStep) throw new Error('slice blew up');
          return engine.stepBacktest(s, n);
        },
      }),
  };
});

const H1: StrategyDefinition = { ...BACKTEST_TEMPLATES.find((t) => t.strategyId === 'trend-following-moving-averages')!.definition, timeframe: 'H1' };

let harness: TestHarness;
let version: StrategyVersion;
let inputs: RunInputs;
beforeEach(async () => {
  gate.waiting = [];
  gate.throwInStep = false;
  harness = await createTestHarness();
  const saved = await harness.container.backtests.saveVersion({ strategyId: null, name: 'Mine', definition: H1, templateId: null, note: '' }, '2026-10-29T10:00:00.000Z' as never);
  if (!saved.ok) throw new Error(saved.error.message);
  version = saved.value;
  const built = runInputs(H1, { ...defaultRunForm(H1, 3), candles: '1500' }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  if (!built.ok) throw new Error(built.error[0]?.message);
  inputs = built.value;
});
afterEach(() => {
  jest.restoreAllMocks();
  harness.db.close();
});

const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={harness.container}>{children}</TestProviders>;
const savedRuns = async () => {
  const r = await harness.container.backtests.runs(version.strategyId);
  return r.ok ? r.value : [];
};
/** Lets pending promises settle until the runner is waiting at a slice boundary. */
async function untilWaiting() {
  for (let k = 0; k < 50 && gate.waiting.length === 0; k += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
  expect(gate.waiting.length).toBeGreaterThan(0);
}
/** Releases slices until the run settles. */
async function drain(done: Promise<unknown>) {
  let settled = false;
  void done.then(() => (settled = true));
  for (let k = 0; k < 200 && !settled; k += 1) {
    await act(async () => {
      releaseAll();
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  expect(settled).toBe(true);
}

describe('useBacktestRunner (Phase 9 review)', () => {
  it('runs and saves once even when Run is pressed twice', async () => {
    const { result } = await renderHook(() => useBacktestRunner(), { wrapper });
    let both!: Promise<unknown>;
    await act(async () => {
      both = Promise.all([result.current.start(version, inputs), result.current.start(version, inputs)]);
    });
    await drain(both);
    expect(result.current.state.status).toBe('done');
    expect(await savedRuns()).toHaveLength(1);
  });

  it('cancels through the hook at the next slice and saves nothing', async () => {
    const { result } = await renderHook(() => useBacktestRunner(), { wrapper });
    let run!: Promise<void>;
    await act(async () => {
      run = result.current.start(version, inputs);
    });
    await untilWaiting();
    expect(result.current.state.status).toBe('running');
    await act(async () => result.current.cancel());
    await drain(run);
    expect(result.current.state.status).toBe('cancelled');
    expect(await savedRuns()).toHaveLength(0);
  });

  it('stops quietly when the screen goes mid-run', async () => {
    const { result, unmount } = await renderHook(() => useBacktestRunner(), { wrapper });
    let run!: Promise<void>;
    await act(async () => {
      run = result.current.start(version, inputs);
    });
    await untilWaiting();
    await unmount();
    await drain(run);
    expect(await savedRuns()).toHaveLength(0);
  });

  it('still saves a run whose save was under way when the screen went', async () => {
    const real = harness.container.backtests.saveRun.bind(harness.container.backtests);
    let letSave!: () => void;
    const saving = new Promise<void>((r) => (letSave = r));
    let saveStarted = false;
    jest.spyOn(harness.container.backtests, 'saveRun').mockImplementation(async (...args) => {
      saveStarted = true;
      await saving;
      return real(...args);
    });
    const { result, unmount } = await renderHook(() => useBacktestRunner(), { wrapper });
    let run!: Promise<void>;
    await act(async () => {
      run = result.current.start(version, inputs);
    });
    for (let k = 0; k < 200 && !saveStarted; k += 1) {
      await act(async () => {
        releaseAll();
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(saveStarted).toBe(true);
    await unmount();
    letSave();
    await run;
    expect(await savedRuns()).toHaveLength(1);
  });

  it('turns a throw inside a slice into an error state', async () => {
    gate.throwInStep = true;
    const { result } = await renderHook(() => useBacktestRunner(), { wrapper });
    let run!: Promise<void>;
    await act(async () => {
      run = result.current.start(version, inputs);
    });
    await drain(run);
    expect(result.current.state).toMatchObject({ status: 'error', error: { kind: 'DataQualityError' } });
    expect(await savedRuns()).toHaveLength(0);
  });

  it('turns a throw while loading the data into an error state', async () => {
    jest.spyOn(harness.container.datasets, 'load').mockImplementation(() => {
      throw new Error('generator broke');
    });
    const { result } = await renderHook(() => useBacktestRunner(), { wrapper });
    await act(async () => result.current.start(version, inputs));
    expect(result.current.state.status).toBe('error');
    // A later run works again: the in-flight guard was released.
    jest.restoreAllMocks();
    let run!: Promise<void>;
    await act(async () => {
      run = result.current.start(version, inputs);
    });
    await drain(run);
    expect(result.current.state.status).toBe('done');
  });
});

async function savedRun(): Promise<BacktestRun> {
  const { result } = await renderHook(() => useBacktestRunner(), { wrapper });
  let run!: Promise<void>;
  await act(async () => {
    run = result.current.start(version, inputs);
  });
  await drain(run);
  const s = result.current.state;
  if (s.status !== 'done') throw new Error(s.status);
  return s.run;
}

describe('useRerun and useSensitivity (Phase 9 review)', () => {
  it('reruns once when started twice, and reproduces the saved result', async () => {
    const run = await savedRun();
    const load = jest.spyOn(harness.container.datasets, 'load');
    const { result } = await renderHook(() => useRerun(run, version), { wrapper });
    let both!: Promise<unknown>;
    await act(async () => {
      both = Promise.all([result.current.start(), result.current.start()]);
    });
    await drain(both);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ status: 'done', reproduced: true });
  });

  it('shows an invalid value as an n/a row and finishes the sweep', async () => {
    const run = await savedRun();
    const { result } = await renderHook(() => useSensitivity(run, version), { wrapper });
    const parameter = { id: 'stop.multiple', label: 'Stop: ATR multiple', base: 2, values: [0, 2] };
    let sweep!: Promise<void>;
    await act(async () => {
      sweep = result.current.start(parameter);
    });
    await drain(sweep);
    const s = result.current.state;
    expect(s.status).toBe('done');
    if (s.status !== 'done') return;
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0]).toMatchObject({ value: 0, trades: null });
    expect(s.rows[0]?.invalid).toEqual(expect.any(String));
    expect(s.rows[1]).toMatchObject({ value: 2, isBase: true, invalid: null });
  });

  it('turns a throw in a slice into an error state for reruns and sweeps', async () => {
    const run = await savedRun();
    gate.throwInStep = true;
    const rerun = await renderHook(() => useRerun(run, version), { wrapper });
    let p!: Promise<void>;
    await act(async () => {
      p = rerun.result.current.start();
    });
    await drain(p);
    expect(rerun.result.current.state.status).toBe('error');
    const sweep = await renderHook(() => useSensitivity(run, version), { wrapper });
    await act(async () => {
      p = sweep.result.current.start({ id: 'stop.multiple', label: 'x', base: 2, values: [2] });
    });
    await drain(p);
    expect(sweep.result.current.state.status).toBe('error');
  });
});
