import { practiceInstrument } from '../../simulation/instruments';
import { comparisonIssues, sensitivityParameters, withParameter, type ComparableRun } from '../compare';
import { defaultCosts } from '../costs';
import { definitionChanges } from '../diff';
import { op, TREND } from './testDefinitions';

const base: ComparableRun = {
  definition: TREND,
  dataset: { instrumentId: 'sim-eurusd', timeframe: 'H1', seed: 1, candles: 3000 },
  capital: '10000',
  costs: defaultCosts(practiceInstrument('sim-eurusd')!),
  split: { kind: 'holdout', inSamplePercent: 70 },
  engineVersion: 2,
};

describe('comparison validity', () => {
  it('needs 2 to 4 runs', () => {
    expect(comparisonIssues([base])[0]?.severity).toBe('refuse');
    expect(comparisonIssues([base, base, base, base, base])[0]?.severity).toBe('refuse');
    expect(comparisonIssues([base, base])).toEqual([]);
  });

  it('refuses different markets or timeframes and warns about other differences', () => {
    const other = { ...base, dataset: { ...base.dataset, instrumentId: 'sim-gold' } };
    expect(comparisonIssues([base, other]).map((i) => i.severity)).toContain('refuse');
    expect(comparisonIssues([base, { ...base, dataset: { ...base.dataset, timeframe: 'H4' as const } }]).some((i) => i.severity === 'refuse')).toBe(true);
    const warned = comparisonIssues([
      base,
      { ...base, dataset: { ...base.dataset, seed: 2 }, capital: '5000', costs: { ...base.costs, spread: '0' }, split: { kind: 'none' }, definition: { ...TREND, riskPercent: 2 } },
    ]);
    expect(warned.every((i) => i.severity === 'warn')).toBe(true);
    expect(warned).toHaveLength(5);
  });
});

describe('parameter sensitivity', () => {
  it('lists numeric settings with nearby values, keeping the current one', () => {
    const params = sensitivityParameters({ ...TREND, target: { kind: 'r_multiple', r: 2 } });
    expect(params.map((p) => p.id)).toEqual(['stop.multiple', 'target.r', 'longEntry.0.right']);
    expect(params[2]?.label).toBe('EMA 50: period');
    const ema = params.find((p) => p.id === 'longEntry.0.right');
    expect(ema?.values).toEqual([30, 40, 50, 60, 70]);
    expect(params[0]?.values).toContain(2);
  });

  it('changes one setting in a copy, moving every matching period together', () => {
    const changed = withParameter(TREND, 'longEntry.0.right', 40);
    const periods = [changed.longEntry, changed.shortEntry, changed.longExit, changed.shortExit].flatMap((g) => g?.conditions.flatMap((c) => [c.left.period, c.right.kind === 'indicator' ? c.right.period : null]) ?? []);
    expect(periods).toEqual([null, 40, 40, 40, null, 40, 40, 40, null, 40, null, 40]);
    expect(TREND.longEntry?.conditions[0]?.right).toEqual(op('ema', 50));
    expect(withParameter(TREND, 'stop.multiple', 3).stop).toEqual({ kind: 'atr', period: 14, multiple: 3 });
    expect(withParameter(TREND, 'nonsense', 3)).toBe(TREND);
  });
});

describe('version changes', () => {
  it('lists every setting that changed, with before and after', () => {
    const next = { ...TREND, riskPercent: 0.5, session: { startHourUtc: 7, endHourUtc: 16 } };
    expect(definitionChanges(TREND, next)).toEqual([
      { path: 'riskPercent', before: '1', after: '0.5' },
      { path: 'session.endHourUtc', before: '(none)', after: '16' },
      { path: 'session.startHourUtc', before: '(none)', after: '7' },
    ]);
    expect(definitionChanges(TREND, TREND)).toEqual([]);
  });
});

describe('comparing runs on real data (A)', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const real = (datasetId: string, contentHash: string): ComparableRun => ({ ...base, dataset: { ...base.dataset, seed: 0, datasetId, contentHash, dataLabel: 'Historical · Twelve Data · EUR/USD' } });
  const dataWarning = (runs: readonly ComparableRun[]) => comparisonIssues(runs).some((i) => /different data/.test(i.message));

  it('treats two data sets with the same content hash as the same data, even under different ids', () => {
    expect(dataWarning([real('pd_1', HASH_A), real('pd_2', HASH_A)])).toBe(false);
  });

  it('warns when the content differs, or when one run is simulated', () => {
    expect(dataWarning([real('pd_1', HASH_A), real('pd_2', HASH_B)])).toBe(true);
    expect(dataWarning([real('pd_1', HASH_A), base])).toBe(true);
  });
});
