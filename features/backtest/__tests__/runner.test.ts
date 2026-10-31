import { BACKTEST_TEMPLATES, definitionIssues, runBacktest, simulatedDataset, type BacktestSetup } from '../../../domain/backtest';
import { dec } from '../../../shared/decimal';
import { addCondition, blankDefinition, forSaving, labLinkFor, removeCondition, setCondition, setJoin, step, withDirection, withIndicator } from '../builder';
import { runBacktestSliced, yieldToEventLoop } from '../runner';
import { backtestSetup, defaultRunForm, runContext, runInputs } from '../setup';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const TREND = BACKTEST_TEMPLATES.find((t) => t.strategyId === 'trend-following-moving-averages')!.definition;
const H1 = { ...TREND, timeframe: 'H1' as const };

function setupFor(candles: number, seed = 5): BacktestSetup {
  const form = defaultRunForm(H1, seed);
  const inputs = runInputs(H1, { ...form, candles: String(candles) }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  if (!inputs.ok) throw new Error(inputs.error[0]?.message);
  const ds = simulatedDataset(inputs.value.dataset);
  if (!ds.ok) throw new Error(ds.error.message);
  const s = backtestSetup(H1, inputs.value, ds.value);
  if (!s.ok) throw new Error(s.error.message);
  return s.value;
}

describe('time-sliced runner (ADR 0006)', () => {
  it('runs about 26,000 H1 candles in slices, yielding to the event loop between them', async () => {
    const setup = setupFor(26000);
    let yields = 0;
    let timerRan = false;
    setTimeout(() => {
      timerRan = true;
    }, 0);
    const progress: number[] = [];
    const started = Date.now();
    const out = await runBacktestSliced(setup, {
      onProgress: (p) => progress.push(p),
      yieldToLoop: async () => {
        yields += 1;
        await yieldToEventLoop();
      },
    });
    const ms = Date.now() - started;
    if (!out.ok || out.value.kind !== 'done') throw new Error('did not finish');
    // One yield per 1,000-candle slice, and other work (the timer) ran in between.
    expect(yields).toBeGreaterThanOrEqual(25);
    expect(timerRan).toBe(true);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress.every((p, i) => i === 0 || p >= (progress[i - 1] as number))).toBe(true);
    expect(out.value.result.candles).toBe(26000);
    expect(out.value.result.metrics.trades).toBeGreaterThan(100);
    // Generous ceiling for CI; locally this takes well under a second.
    expect(ms).toBeLessThan(20000);
    // Slicing does not change the answer.
    const once = runBacktest(setup);
    expect(once.ok && once.value.fingerprint).toBe(out.value.result.fingerprint);
  }, 60000);

  it('stops at the next slice when cancelled', async () => {
    let slices = 0;
    const out = await runBacktestSliced(setupFor(5000), { chunk: 500, isCancelled: () => slices >= 2, yieldToLoop: async () => void (slices += 1) });
    expect(out.ok && out.value.kind).toBe('cancelled');
    expect(slices).toBe(2);
  });

  it('refuses a bad slice size or setup', async () => {
    expect((await runBacktestSliced(setupFor(600), { chunk: 0 })).ok).toBe(false);
    expect((await runBacktestSliced({ ...setupFor(600), capital: dec(-1) })).ok).toBe(false);
  });
});

describe('run form', () => {
  it('checks every field and fills the dataset from the strategy', () => {
    const form = defaultRunForm(H1);
    expect(form.spread).toBe('0.0001');
    const bad = runInputs(H1, { ...form, seed: '1.5', candles: '10', capital: 'lots', spread: '-1' }, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
    expect(!bad.ok && bad.error.map((i) => i.field)).toEqual(['seed', 'candles', 'capital', 'spread']);
    const good = runInputs(H1, form, { versionsTried: 3, otherVersionsWithOutOfSample: 0 });
    expect(good.ok && good.value).toMatchObject({ dataset: { instrumentId: 'sim-eurusd', timeframe: 'H1', seed: 1, candles: 3000 }, versionsTried: 3 });
  });

  it('refuses data for another market', () => {
    const ds = simulatedDataset({ instrumentId: 'sim-gold', timeframe: 'H1', seed: 1, candles: 600 });
    const inputs = runInputs(H1, defaultRunForm(H1), { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
    if (!ds.ok || !inputs.ok) throw new Error('setup');
    expect(backtestSetup(H1, inputs.value, ds.value).ok).toBe(false);
  });
});

describe('builder edits', () => {
  it('never changes the definition it is given', () => {
    const d = blankDefinition();
    const frozen = JSON.stringify(d);
    const added = addCondition(d, 'longEntry');
    expect(added.longEntry?.conditions).toHaveLength(2);
    const joined = setJoin(added, 'longEntry', 'any');
    expect(joined.longEntry?.join).toBe('any');
    const changed = setCondition(joined, 'longEntry', 1, { left: { kind: 'indicator', indicator: 'rsi', period: 14, ago: 0, times: 1 }, op: 'below', right: { kind: 'number', value: 30 } });
    expect(changed.longEntry?.conditions[1]?.op).toBe('below');
    expect(removeCondition(removeCondition(changed, 'longEntry', 0), 'longEntry', 0).longEntry).toBeNull();
    expect(JSON.stringify(d)).toBe(frozen);
  });

  it('mirrors rules when switching to both directions, and drops unused groups on save', () => {
    const both = withDirection(blankDefinition(), 'both');
    expect(both.shortEntry?.conditions[0]?.op).toBe('crosses_below');
    expect(definitionIssues(forSaving(both))).toEqual([]);
    const longOnly = forSaving(withDirection(both, 'long'));
    expect(longOnly.shortEntry).toBeNull();
    expect(longOnly.shortExit).toBeNull();
  });

  it('switching indicator resets its period; steps stay in range', () => {
    expect(withIndicator({ kind: 'indicator', indicator: 'close', period: null, ago: 2, times: 1 }, 'rsi')).toEqual({ kind: 'indicator', indicator: 'rsi', period: 14, ago: 2, times: 1 });
    expect(withIndicator({ kind: 'indicator', indicator: 'close', period: null, ago: 0, times: 1 }, 'number')).toEqual({ kind: 'number', value: 30 });
    expect(step(0.3, 0.1, { min: 0.1, max: 5 })).toBe(0.4);
    expect(step(5, 1, { min: 0.1, max: 5 })).toBe(5);
  });
});

describe('library templates', () => {
  const pages = readdirSync(join(__dirname, '../../../content/strategies')).map((f) => JSON.parse(readFileSync(join(__dirname, '../../../content/strategies', f), 'utf8')) as { id: string; style: string; category: string; rules: unknown });

  it('exist only for rule-based trading pages with rules, and every such page has one', () => {
    const eligible = pages.filter((p) => p.style === 'rules_based' && p.category === 'trading' && p.rules).map((p) => p.id).sort();
    expect(BACKTEST_TEMPLATES.map((t) => t.strategyId).sort()).toEqual(eligible);
  });

  it('are valid, trade on simulated data, and link from their pages', () => {
    for (const t of BACKTEST_TEMPLATES) {
      expect(definitionIssues(t.definition)).toEqual([]);
      const ds = simulatedDataset({ instrumentId: t.definition.instrumentId, timeframe: t.definition.timeframe, seed: 2, candles: 3000 });
      if (!ds.ok) throw new Error(ds.error.message);
      const form = defaultRunForm(t.definition);
      const inputs = runInputs(t.definition, form, { versionsTried: 1, otherVersionsWithOutOfSample: 0 });
      if (!inputs.ok) throw new Error('inputs');
      const r = runBacktest({ definition: t.definition, dataset: ds.value, capital: dec(10000), costs: inputs.value.costs, split: inputs.value.split });
      expect(r.ok && r.value.metrics.trades).toBeGreaterThan(0);
      expect(labLinkFor({ id: t.strategyId, category: 'trading', style: 'rules_based' })).toMatchObject({ kind: 'template', templateId: t.strategyId });
    }
    expect(labLinkFor({ id: 'dividend-index-investing', category: 'investing', style: 'rules_based' })).toEqual({ kind: 'sandbox' });
    expect(labLinkFor({ id: 'diversification-position-sizing', category: 'risk_principle', style: 'rules_based' })).toEqual({ kind: 'portfolio' });
    expect(labLinkFor({ id: 'carry-concept', category: 'trading', style: 'discretionary' })).toBeNull();
  });
});

describe('run context (Phase 9 review)', () => {
  it('counts the other versions whose out-of-sample results were already shown', () => {
    const holdout = { kind: 'holdout' as const, inSamplePercent: 70 };
    const runs = [
      { version: 1, inputs: { split: holdout } },
      { version: 1, inputs: { split: holdout } },
      { version: 2, inputs: { split: { kind: 'walk_forward' as const, folds: 4 } } },
      { version: 3, inputs: { split: { kind: 'none' as const } } },
      { version: 4, inputs: { split: holdout } },
    ];
    expect(runContext(4, 4, runs)).toEqual({ versionsTried: 4, otherVersionsWithOutOfSample: 2 });
    expect(runContext(1, 1, [])).toEqual({ versionsTried: 1, otherVersionsWithOutOfSample: 0 });
  });

  it('a throw inside a slice becomes an error result, not a rejection', async () => {
    const out = await runBacktestSliced(setupFor(1200), {
      yieldToLoop: async () => undefined,
      step: () => {
        throw new Error('boom');
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.message).toMatch(/boom/);
  });
});
