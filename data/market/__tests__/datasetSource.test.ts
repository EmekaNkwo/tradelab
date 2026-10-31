import { BACKTEST_TEMPLATES, simulatedDataset, type DatasetSpec } from '../../../domain/backtest';
import { createSimulatedDatasetSource, SIMULATED_CANDLES_PER_STEP } from '../datasetSource';

/** ADR 0006, Phase 12: simulated data is generated in steps, with pauses between them, and is identical to one call. */

const H1 = BACKTEST_TEMPLATES.find((t) => t.strategyId === 'trend-following-moving-averages')!.definition;
const specFor = (candles: number): DatasetSpec => ({ instrumentId: H1.instrumentId, timeframe: 'H1', seed: 5, candles });
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('simulated data loads in steps', () => {
  it('yields while generating 26,000 H1 candles and gives the same data as one call', async () => {
    const spec = specFor(26000);
    let pauses = 0;
    let longest = 0;
    let last = performance.now();
    const started = last;
    const stepped = await createSimulatedDatasetSource().load(spec, {
      pause: async () => {
        longest = Math.max(longest, performance.now() - last);
        pauses += 1;
        await yieldToEventLoop();
        last = performance.now();
      },
    });
    const total = performance.now() - started;
    const once = simulatedDataset(spec);
    expect(stepped.ok && once.ok).toBe(true);
    if (!stepped.ok || !once.ok) return;
    expect(stepped.value.candles).toEqual(once.value.candles);
    expect(stepped.value.regimes).toEqual(once.value.regimes);
    // A step ends at the first scenario segment (150 to 350 candles) past the step size.
    expect(pauses).toBeGreaterThanOrEqual(Math.floor(26000 / (SIMULATED_CANDLES_PER_STEP + 350)));
    // Generation was one blocking call of a few hundred milliseconds; no step is now a large share of it.
    expect(longest).toBeLessThan(total / 5);
  }, 60000);

  it('stops early when cancelled', async () => {
    let pauses = 0;
    const out = await createSimulatedDatasetSource().load(specFor(26000), {
      pause: async () => void (pauses += 1),
      isCancelled: () => pauses >= 3,
    });
    expect(out.ok).toBe(false);
    expect(pauses).toBe(3);
  });

  it('still loads in one call without options', async () => {
    const out = await createSimulatedDatasetSource().load(specFor(600));
    expect(out.ok && out.value.candles.length).toBe(600);
  });
});
