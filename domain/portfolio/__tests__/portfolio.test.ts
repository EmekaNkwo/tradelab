import { dec } from '../../../shared/decimal';
import { generateScenario } from '../../market/scenarios';
import { practiceInstrument, type PracticeInstrument } from '../../simulation/instruments';
import { advancePaper, placePaperOrder, startPaper, type PaperState } from '../../simulation/paper';
import { investingSandbox } from '../sandbox';
import { alignedReturns, pearson, portfolioSummary, type PortfolioAccountInput } from '../portfolio';

function account(id: string, instrumentId: string, seed: number, cursor: number, size: string | null): PortfolioAccountInput {
  const instrument = practiceInstrument(instrumentId) as PracticeInstrument;
  const candles = generateScenario({ kind: 'range', seed, count: 400, startPrice: instrument.startPrice, precision: instrument.precision }).candles;
  const started = startPaper(instrument, candles, cursor, dec(10000));
  if (!started.ok) throw new Error('start');
  let state: PaperState = started.value;
  if (size) {
    const placed = placePaperOrder(state, instrument, candles, { side: 'buy', type: 'market', size: dec(size), price: null, stopLoss: null, takeProfit: null, violations: [], plannedRisk: null, equityAtOrder: dec(10000) });
    if (!placed.ok) throw new Error(placed.error.message);
    state = advancePaper(placed.value, instrument, candles);
  }
  return { id, name: id, instrument, state, candles };
}

describe('portfolio summary', () => {
  it('adds up exposure by market and finds the most concentrated market', () => {
    const fx = account('fx', 'sim-eurusd', 1, 100, '0.1');
    const stock = account('stock', 'sim-stock', 2, 100, '5');
    const empty = account('gold', 'sim-gold', 3, 100, null);
    const p = portfolioSummary([fx, stock, empty]);
    expect(p.accounts).toHaveLength(3);
    const fxRow = p.byMarket.find((m) => m.market === 'forex');
    // 0.1 lot × 100,000 units at about 1.1.
    expect(fxRow?.exposure).toBeGreaterThan(10000);
    expect(fxRow?.exposure).toBeLessThan(12500);
    expect(p.byMarket[0]?.market).toBe('forex');
    expect(p.concentration).toBeCloseTo((fxRow?.exposure ?? 0) / p.totalExposure, 5);
    expect(p.byMarket.reduce((t, m) => t + m.share, 0)).toBeCloseTo(1, 5);
    expect(p.exposureToEquity).toBeGreaterThan(0);
    expect(p.worstDrawdown).not.toBeNull();
    expect(p.correlations).toHaveLength(3);
    for (const c of p.correlations) expect(Math.abs(c.value)).toBeLessThanOrEqual(1);
  });

  it('says when there is not enough data for a correlation', () => {
    expect(portfolioSummary([account('a', 'sim-eurusd', 1, 100, null)]).correlationNote).toMatch(/two paper accounts/);
    expect(portfolioSummary([account('a', 'sim-eurusd', 1, 10, null), account('b', 'sim-gold', 2, 10, null)]).correlationNote).toMatch(/30 revealed candles/);
    const empty = portfolioSummary([]);
    expect(empty.concentration).toBeNull();
    expect(empty.worstDrawdown).toBeNull();
  });

  it('pearson is 1 for series that move together and null for a flat one', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe('investing sandbox', () => {
  it('compares an equal-weight basket with each single company, reproducibly', () => {
    const r = investingSandbox({ seed: 4, companies: 10, years: 10, startAmount: 10000 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.basket).toHaveLength(121);
    expect(r.value.basket[0]).toBe(10000);
    expect(r.value.singles).toHaveLength(10);
    // The basket's end value is the average of the single-company end values.
    const avg = r.value.singleFinals.reduce((a, b) => a + b, 0) / 10;
    expect(r.value.basketFinal).toBeCloseTo(avg, 0);
    expect(r.value.worstSingle).toBeLessThanOrEqual(r.value.medianSingle);
    expect(r.value.bestSingle).toBeGreaterThanOrEqual(r.value.medianSingle);
    expect(r.value.assumptions[0]).toMatch(/Simulated/);
    const again = investingSandbox({ seed: 4, companies: 10, years: 10, startAmount: 10000 });
    expect(again.ok && again.value.singleFinals).toEqual(r.value.singleFinals);
  });

  it('refuses settings outside its limits', () => {
    expect(investingSandbox({ seed: 1, companies: 1, years: 10, startAmount: 1000 }).ok).toBe(false);
    expect(investingSandbox({ seed: 1, companies: 5, years: 40, startAmount: 1000 }).ok).toBe(false);
    expect(investingSandbox({ seed: 1, companies: 5, years: 5, startAmount: 10 }).ok).toBe(false);
    expect(investingSandbox({ seed: -1, companies: 5, years: 5, startAmount: 1000 }).ok).toBe(false);
  });
});

describe('portfolio review fixes', () => {
  it('correlates only candles at the same times', () => {
    const a = new Map([['2024-01-01T01:00:00.000Z', 0.01], ['2024-01-01T02:00:00.000Z', -0.02], ['2024-01-01T03:00:00.000Z', 0.03]]);
    const b = new Map([['2024-01-01T03:00:00.000Z', 0.3], ['2024-01-01T02:00:00.000Z', -0.2], ['2024-01-01T09:00:00.000Z', 0.9]]);
    expect(alignedReturns(a, b)).toEqual({ xs: [-0.02, 0.03], ys: [-0.2, 0.3] });
  });

  it('does not pair accounts whose candles never share a time', () => {
    const fx = account('fx', 'sim-eurusd', 1, 100, null);
    const other = account('later', 'sim-gold', 2, 100, null);
    const shifted = { ...other, candles: other.candles.map((c) => ({ ...c, time: new Date(Date.parse(c.time) + 30 * 60_000).toISOString() as typeof c.time })) };
    expect(portfolioSummary([fx, other]).correlations).toHaveLength(1);
    const p = portfolioSummary([fx, shifted]);
    expect(p.correlations).toHaveLength(0);
    expect(p.correlationNote).toMatch(/at the same times/);
  });

  it('describes sandbox growth as an average monthly drift, not a long-run figure', () => {
    const r = investingSandbox({ seed: 4, companies: 10, years: 10, startAmount: 10000 });
    if (!r.ok) throw new Error(r.error.message);
    const text = r.value.assumptions.join(' ');
    expect(text).toMatch(/average monthly growth \(drift\)/);
    expect(text).not.toMatch(/long-run/);
  });
});
