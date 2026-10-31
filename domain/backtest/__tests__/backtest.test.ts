import { dec } from '../../../shared/decimal';
import { openPrice } from '../../market/fills';
import type { Candle } from '../../models/markets';
import { practiceInstrument } from '../../simulation/instruments';
import { advancePaper, closePaperPositionAtNextOpen, placePaperOrder, startPaper } from '../../simulation/paper';
import { fillCosts } from '../../simulation/pricing';
import { defaultCosts, withCosts, costIssues, missingCosts } from '../costs';
import { checkCandles, simulatedDataset, type Dataset } from '../dataset';
import { backtestProgress, createBacktest, stepBacktest, warmupFor, type BacktestSetup } from '../engine';
import { downsampleLast, downsampleMax, drawdownSeries } from '../metrics';
import { runBacktest, inputHash, canonicalJson, MANY_VERSIONS } from '../result';
import { groupAt, prepareSeries } from '../signals';
import { definitionIssues } from '../validate';
import { op, TREND } from './testDefinitions';

const EURUSD = practiceInstrument('sim-eurusd')!;

function dataset(candles = 3000, seed = 7): Dataset {
  const d = simulatedDataset({ instrumentId: 'sim-eurusd', timeframe: 'H1', seed, candles });
  if (!d.ok) throw new Error(d.error.message);
  return d.value;
}

const setup = (patch: Partial<BacktestSetup> = {}): BacktestSetup => ({
  definition: TREND,
  dataset: dataset(),
  capital: dec(10000),
  costs: defaultCosts(EURUSD),
  split: { kind: 'holdout', inSamplePercent: 70 },
  ...patch,
});

const run = (s: BacktestSetup, versions = 1) => {
  const r = runBacktest(s, { versionsTried: versions, otherVersionsWithOutOfSample: 0 });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('simulated datasets', () => {
  it('are reproducible, labelled simulated, and carry a regime for every candle', () => {
    const a = dataset(2000, 3);
    const b = dataset(2000, 3);
    expect(a.candles.map((c) => c.close.toString())).toEqual(b.candles.map((c) => c.close.toString()));
    expect(a.origin).toBe('simulated');
    expect(a.label).toBe('Simulated data');
    expect(a.regimes).toHaveLength(2000);
    expect(new Set(a.regimes).size).toBeGreaterThan(1);
    expect(checkCandles(a.candles, 'H1')).toEqual({ errors: [], warnings: [] });
    expect(dataset(2000, 4).candles[1999]?.close.toString()).not.toBe(a.candles[1999]?.close.toString());
  });

  it('refuse bad specs', () => {
    expect(simulatedDataset({ instrumentId: 'nope', timeframe: 'H1', seed: 1, candles: 1000 }).ok).toBe(false);
    expect(simulatedDataset({ instrumentId: 'sim-eurusd', timeframe: 'H1', seed: 1, candles: 10 }).ok).toBe(false);
    expect(simulatedDataset({ instrumentId: 'sim-eurusd', timeframe: 'H1', seed: -1, candles: 1000 }).ok).toBe(false);
  });

  it('data checks refuse duplicate or backwards times and disclose missing candles', () => {
    const c = dataset(600).candles;
    const dup = [...c.slice(0, 10), { ...(c[10] as Candle), time: (c[9] as Candle).time }, ...c.slice(11)];
    expect(checkCandles(dup, 'H1').errors[0]).toMatch(/not after/);
    const gap = [...c.slice(0, 100), ...c.slice(105)];
    expect(checkCandles(gap, 'H1').warnings[0]).toMatch(/1 gap/);
    const bad = { ...dataset(600), candles: dup };
    const created = createBacktest(setup({ dataset: bad }));
    expect(!created.ok && created.error.message).toMatch(/failed its checks/);
  });
});

describe('strategy validation', () => {
  it('accepts the fixture and reports every problem with a field', () => {
    expect(definitionIssues(TREND)).toEqual([]);
    const broken = {
      ...TREND,
      instrumentId: 'sim-stock',
      riskPercent: 9,
      stop: { kind: 'atr' as const, period: 1, multiple: 30 },
      longEntry: { join: 'all' as const, conditions: [{ left: op('ema', 50), op: 'above' as const, right: op('ema', 50) }] },
      session: { startHourUtc: 5, endHourUtc: 5 },
    };
    const fields = definitionIssues(broken).map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(['direction', 'riskPercent', 'stop', 'longEntry.0', 'session']));
    expect(definitionIssues({ ...TREND, direction: 'long', longEntry: null }).map((i) => i.field)).toContain('longEntry');
  });

  it('costs must be numbers, never negative except swaps', () => {
    expect(costIssues(defaultCosts(EURUSD))).toEqual([]);
    expect(costIssues({ ...defaultCosts(EURUSD), spread: '-1', swapLong: 'x' }).map((i) => i.field)).toEqual(['spread', 'swapLong']);
    expect(missingCosts({ ...defaultCosts(EURUSD), spread: '0' })).toBe(true);
    expect(withCosts(EURUSD, { ...defaultCosts(EURUSD), spread: '0.0002' }).spread.toString()).toBe('0.0002');
    expect(EURUSD.spread.toString()).toBe('0.0001');
  });
});

describe('no look-ahead', () => {
  it('signals on a prefix of the candles match the full run for every candle in the prefix', () => {
    const candles = dataset(2500).candles;
    const full = prepareSeries(TREND, candles);
    const cut = 1500;
    const part = prepareSeries(TREND, candles.slice(0, cut));
    for (let i = 0; i < cut; i += 1) {
      expect(groupAt(TREND.longEntry, part, i)).toBe(groupAt(TREND.longEntry, full, i));
      expect(groupAt(TREND.shortExit, part, i)).toBe(groupAt(TREND.shortExit, full, i));
    }
  });

  it('trades closed before the end of a shorter run are identical in the full run', () => {
    const d = dataset(3000);
    const short = { ...d, candles: d.candles.slice(0, 2000), regimes: d.regimes.slice(0, 2000) };
    const a = run(setup({ dataset: short, split: { kind: 'none' } })).trades.filter((t) => t.reason !== 'end_of_data');
    const b = run(setup({ dataset: d, split: { kind: 'none' } })).trades.slice(0, a.length);
    expect(a.length).toBeGreaterThan(5);
    expect(a.map((t) => [t.entryIndex, t.exitIndex, t.net.toString()])).toEqual(b.map((t) => [t.entryIndex, t.exitIndex, t.net.toString()]));
  });
});

describe('backtest engine', () => {
  const result = run(setup());
  const candles = setup().dataset.candles;

  it('fills every entry at the next candle’s open, on the ask or bid with slippage', () => {
    expect(result.trades.length).toBeGreaterThan(10);
    for (const t of result.trades) {
      expect(t.entryIndex).toBe(t.signalIndex + 1);
      expect(t.entry.toString()).toBe(openPrice(fillCosts(EURUSD), t.side, (candles[t.entryIndex] as Candle).open, true).toString());
    }
  });

  it('holds one trade at a time and never re-enters on the candle it left', () => {
    result.trades.slice(1).forEach((t, k) => expect(t.entryIndex).toBeGreaterThan((result.trades[k] as { exitIndex: number }).exitIndex));
  });

  it('sizes each trade so the planned loss is within the risk per trade', () => {
    for (const t of result.trades) expect(t.plannedRisk.toNumber()).toBeGreaterThan(0);
    // Equity never exceeds 2× capital in this run, so 1% risk stays under 200 USD.
    expect(Math.max(...result.trades.map((t) => t.plannedRisk.toNumber()))).toBeLessThan(200);
  });

  it('reports the metrics consistently', () => {
    const m = result.metrics;
    expect(m.trades).toBe(result.trades.length);
    expect(m.wins + m.losses).toBeLessThanOrEqual(m.trades);
    expect(m.finalEquity).toBeCloseTo(10000 + m.net, 1);
    expect(m.netReturn).toBeCloseTo((m.net / 10000) * 100, 1);
    expect(m.exposure).toBeGreaterThan(0);
    expect(m.exposure).toBeLessThanOrEqual(100);
    expect(result.byRegime.reduce((a, r) => a + r.trades, 0)).toBe(m.trades);
    expect(result.equityCurve.length).toBeLessThanOrEqual(200);
    expect(Math.max(...result.drawdownCurve)).toBeCloseTo(m.maxDrawdown, 1);
    expect(result.conventions.some((c) => /stop is assumed to fill first/.test(c))).toBe(true);
    expect(result.conventions.some((c) => /Survivorship/.test(c))).toBe(true);
    expect(result.dataLabel).toBe('Simulated data');
  });

  it('splits trades into in-sample and out-of-sample, or walk-forward blocks', () => {
    expect(result.split.map((p) => p.label)).toEqual(['In-sample', 'Out-of-sample']);
    // Trades crossing the boundary are in neither part, and are counted.
    expect(result.split.reduce((a, p) => a + p.trades, 0) + result.splitExcluded).toBe(result.metrics.trades);
    const wf = run(setup({ split: { kind: 'walk_forward', folds: 4 } }));
    expect(wf.split).toHaveLength(4);
    expect(wf.split.reduce((a, p) => a + p.trades, 0) + wf.splitExcluded).toBe(wf.metrics.trades);
    expect(run(setup({ split: { kind: 'none' } })).warnings.some((w) => /No out-of-sample/.test(w))).toBe(true);
  });

  it('is reproducible: the same setup gives the same hash and result', () => {
    const again = run(setup());
    expect(again.inputHash).toBe(result.inputHash);
    expect(again.fingerprint).toBe(result.fingerprint);
    expect(inputHash(setup({ capital: dec(5000) }))).not.toBe(result.inputHash);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('warns about small samples, many versions and zero costs', () => {
    const short = run(setup({ dataset: dataset(600) }), MANY_VERSIONS);
    expect(short.warnings.join(' ')).toMatch(/Small sample|No trades/);
    expect(short.warnings.join(' ')).toMatch(/overfitting/);
    expect(run(setup({ costs: { ...defaultCosts(EURUSD), spread: '0' } })).warnings.join(' ')).toMatch(/costs are set to zero/);
  });

  it('applies the session filter and daily limits, and counts signals it did not trade', () => {
    const narrow = run(setup({ definition: { ...TREND, session: { startHourUtc: 8, endHourUtc: 10 } } }));
    expect(narrow.skipped.outside_session).toBeGreaterThan(0);
    for (const t of narrow.trades) expect([8, 9]).toContain(Number((candles[t.entryIndex] as Candle).time.slice(11, 13)));
    const capped = run(setup({ definition: { ...TREND, limits: { maxTradesPerDay: 1, dailyLossPercent: 0.5, pauseAfterLosses: 1 } } }));
    expect(capped.skipped.daily_limit).toBeGreaterThan(0);
    const perDay = new Map<string, number>();
    for (const t of capped.trades) {
      const day = (candles[t.signalIndex] as Candle).time.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    expect(Math.max(...perDay.values())).toBe(1);
  });

  it('takes profit at an R multiple and never lets a long-only market go short', () => {
    const withTarget = run(setup({ definition: { ...TREND, target: { kind: 'r_multiple', r: 2 } } }));
    expect(withTarget.trades.some((t) => t.reason === 'take_profit')).toBe(true);
    const stock = simulatedDataset({ instrumentId: 'sim-stock', timeframe: 'H1', seed: 2, candles: 2000 });
    if (!stock.ok) throw new Error('no data');
    const longOnly = run(setup({ dataset: stock.value, costs: defaultCosts(practiceInstrument('sim-stock')!), definition: { ...TREND, instrumentId: 'sim-stock', direction: 'long', shortEntry: null, shortExit: null } }));
    expect(longOnly.trades.every((t) => t.side === 'buy')).toBe(true);
  });

  it('runs in slices with progress, and slices give the same result as one go', () => {
    const created = createBacktest(setup());
    if (!created.ok) throw new Error(created.error.message);
    let s = created.value;
    expect(backtestProgress(s)).toBe(0);
    s = stepBacktest(s, 500);
    expect(backtestProgress(s)).toBeGreaterThan(0);
    expect(backtestProgress(s)).toBeLessThan(1);
    while (!s.done) s = stepBacktest(s, 333);
    expect(backtestProgress(s)).toBe(1);
    expect(stepBacktest(s, 10)).toBe(s);
    expect(s.paper.history.map((t) => t.net.toString())).toEqual(run(setup()).trades.map((t) => t.net.toString()));
  });

  it('refuses setups it cannot run honestly', () => {
    expect(createBacktest(setup({ capital: dec(0) })).ok).toBe(false);
    expect(createBacktest(setup({ split: { kind: 'holdout', inSamplePercent: 95 } })).ok).toBe(false);
    expect(createBacktest(setup({ split: { kind: 'walk_forward', folds: 1 } })).ok).toBe(false);
    expect(createBacktest(setup({ definition: { ...TREND, timeframe: 'D1' } })).ok).toBe(false);
    expect(createBacktest(setup({ costs: { ...defaultCosts(EURUSD), slippage: '-1' } })).ok).toBe(false);
    expect(warmupFor(TREND)).toBe(62);
  });
});

describe('closing at the next open (rule exits)', () => {
  it('closes at the next candle’s open on the bid, before that candle is processed', () => {
    const candles = dataset(600).candles;
    const started = startPaper(EURUSD, candles, 100, dec(10000));
    if (!started.ok) throw new Error('start');
    const placed = placePaperOrder(started.value, EURUSD, candles, { side: 'buy', type: 'market', size: dec('0.1'), price: null, stopLoss: null, takeProfit: null, violations: [], plannedRisk: null, equityAtOrder: dec(10000) });
    if (!placed.ok) throw new Error(placed.error.message);
    const open = advancePaper(placed.value, EURUSD, candles);
    const closed = closePaperPositionAtNextOpen(open, EURUSD, candles, 1);
    if (!closed.ok) throw new Error(closed.error.message);
    const trade = closed.value.history[0];
    expect(trade?.closedAt).toBe(102);
    expect(trade?.exit.toString()).toBe((candles[102] as Candle).open.minus(EURUSD.spread.div(2)).minus(EURUSD.slippage).toString());
    expect(closePaperPositionAtNextOpen(closed.value, EURUSD, candles, 1).ok).toBe(false);
  });
});

describe('curves', () => {
  it('drawdown is the fall from the running peak, and downsampling keeps the worst fall', () => {
    expect(drawdownSeries([100, 120, 90, 130])).toEqual([0, 0, 25, 0]);
    const values = Array.from({ length: 1000 }, (_v, i) => (i === 517 ? 40 : i % 7));
    expect(Math.max(...downsampleMax(values, 50))).toBe(40);
    expect(downsampleLast([1, 2, 3, 4], 2)).toEqual([2, 4]);
    expect(downsampleLast([1, 2], 5)).toEqual([1, 2]);
  });
});
