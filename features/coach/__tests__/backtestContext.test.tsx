/**
 * The coach's backtest facts come from a real saved run: the engine's metrics
 * and warnings, the strategy's name and version, and its rules only when the
 * learner agreed to share them.
 */
import { backtestSetup, defaultRunForm, METRIC_ROWS, runBacktestSliced, runInputs, templateFor } from '../../backtest';
import type { UtcIso } from '../../../shared/time';
import { createTestHarness, type TestHarness } from '../../../testing/testContainer';
import { backtestContext } from '../requests';

const NOW = '2026-10-29T10:00:00.000Z' as UtcIso;
const TREND = templateFor('trend-following-moving-averages')!;

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
});
afterEach(() => harness.db.close());

async function savedRun() {
  const v = await harness.container.backtests.saveVersion(
    { strategyId: null, name: 'Trend test', definition: { ...TREND.definition, instrumentId: 'sim-eurusd', timeframe: 'H1' }, templateId: TREND.strategyId, note: '' },
    NOW,
  );
  if (!v.ok) throw new Error(v.error.message);
  const inputs = runInputs(v.value.definition, { ...defaultRunForm(v.value.definition, 4), candles: '1000' }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  if (!inputs.ok) throw new Error('inputs');
  const ds = await harness.container.datasets.load(inputs.value.dataset);
  if (!ds.ok) throw new Error('data');
  const setup = backtestSetup(v.value.definition, inputs.value, ds.value);
  if (!setup.ok) throw new Error(setup.error.message);
  const r = await runBacktestSliced(setup.value, { yieldToLoop: async () => undefined });
  if (!r.ok || r.value.kind !== 'done') throw new Error('run');
  const run = await harness.container.backtests.saveRun(v.value.strategyId, v.value.version, inputs.value, r.value.result, NOW);
  if (!run.ok) throw new Error(run.error.message);
  return { version: v.value, run: run.value };
}

describe('backtestContext', () => {
  it('names the strategy version and gives the engine’s own metrics and warnings', async () => {
    const { version, run } = await savedRun();
    const c = backtestContext(run, version, false);
    expect(c.strategyName).toBe(`Trend test v${version.version}`);
    expect(c.dataLabel).toBe(run.result.dataLabel);
    expect(c.metrics).toEqual(METRIC_ROWS.slice(0, 10).map((m) => ({ label: m.label, value: m.format(run.result.metrics) })));
    expect(c.warnings).toEqual(run.result.warnings.slice(0, 10));
    expect(c.strategyRules).toBeNull();
  }, 45_000);

  it('includes the rules only with consent, and never for an unknown version', async () => {
    const { version, run } = await savedRun();
    const shared = backtestContext(run, version, true);
    expect(shared.strategyRules?.length).toBeGreaterThan(0);
    const unknown = backtestContext(run, null, true);
    expect(unknown.strategyName).toBe('This strategy');
    expect(unknown.strategyRules).toBeNull();
  }, 45_000);
});
