import type { FictionalCompany } from '../../models/labs';
import { companyMetrics } from '../companyMetrics';
import { labRecords, markPicks } from '../grading';

const year = (label: string, over: Partial<FictionalCompany['years'][number]> = {}) => ({
  label,
  revenue: 1000,
  costOfSales: 600,
  operatingExpenses: 200,
  interest: 20,
  tax: 45,
  operatingCashFlow: 150,
  capitalExpenditure: 50,
  dividendsPaid: 40,
  cash: 100,
  debt: 300,
  equity: 700,
  ...over,
});

const company: FictionalCompany = {
  id: 'example',
  name: 'Example Co (fictional)',
  sector: 'Tools',
  summary: 's',
  assumptions: 'a',
  currency: 'USD',
  sharePrice: 20,
  sharesOutstanding: 50,
  years: [year('Year 1', { revenue: 800, costOfSales: 480, operatingExpenses: 160 }), year('Year 2')],
  notes: ['n'],
  glossaryIds: [],
};

describe('companyMetrics', () => {
  it('builds profits, margins, returns and valuation from the statements', () => {
    const m = companyMetrics(company);
    const l = m.latest;
    expect(l.grossProfit).toBe(400);
    expect(l.operatingProfit).toBe(200);
    expect(l.netIncome).toBe(135);
    expect(l.grossMargin).toBeCloseTo(0.4);
    expect(l.operatingMargin).toBeCloseTo(0.2);
    expect(l.netMargin).toBeCloseTo(0.135);
    expect(l.freeCashFlow).toBe(100);
    expect(l.netDebt).toBe(200);
    expect(l.returnOnEquity).toBeCloseTo(135 / 700);
    expect(l.returnOnCapital).toBeCloseTo(0.2);
    expect(l.cashConversion).toBeCloseTo(150 / 135);
    expect(l.revenueGrowth).toBeCloseTo(0.25);
    expect(l.eps).toBeCloseTo(2.7);
    expect(m.years[0]?.revenueGrowth).toBeNull();
    expect(m.marketCap).toBe(1000);
    expect(m.enterpriseValue).toBe(1200);
    expect(m.peRatio).toBeCloseTo(20 / 2.7);
    expect(m.earningsYield).toBeCloseTo(0.135);
    expect(m.dividendYield).toBeCloseTo(0.04);
    expect(m.payoutRatio).toBeCloseTo(40 / 135);
    expect(m.netDebtToOperatingProfit).toBeCloseTo(1);
  });

  it('gives no P/E, payout or cash conversion on a loss, and no returns on negative equity', () => {
    const loss = { ...company, years: [year('Year 1'), year('Year 2', { operatingExpenses: 500, equity: -50, debt: 0 })] };
    const m = companyMetrics(loss);
    expect(m.latest.netIncome).toBeLessThan(0);
    expect(m.peRatio).toBeNull();
    expect(m.payoutRatio).toBeNull();
    expect(m.latest.cashConversion).toBeNull();
    expect(m.latest.returnOnEquity).toBeNull();
    expect(m.latest.returnOnCapital).toBeNull();
    expect(m.netDebtToOperatingProfit).toBeNull();
    expect(m.earningsYield).toBeLessThan(0);
  });
});

describe('markPicks', () => {
  const options = [
    { id: 'a', expected: true },
    { id: 'b', expected: true },
    { id: 'c', expected: false },
    { id: 'd', expected: false },
  ];

  it('judges every option, so missing one costs as much as a wrong pick', () => {
    const m = markPicks(options, ['a', 'c']);
    expect(m.verdicts).toEqual({ a: 'found', b: 'missed', c: 'wrongly_picked', d: 'rightly_left' });
    expect(m.correct).toBe(2);
    expect(m.score).toBe(0.5);
  });

  it('does not reward picking everything', () => {
    expect(markPicks(options, ['a', 'b', 'c', 'd']).score).toBe(0.5);
    expect(markPicks(options, ['a', 'b']).score).toBe(1);
    expect(markPicks([], []).score).toBe(0);
  });
});

describe('labRecords', () => {
  it('keeps attempts, the best score and the latest score per exercise', () => {
    const r = labRecords([
      { refId: 'x', score: 0.5, answeredAt: '2026-01-01T00:00:00.000Z' },
      { refId: 'x', score: 1, answeredAt: '2026-01-02T00:00:00.000Z' },
      { refId: 'x', score: 0.75, answeredAt: '2026-01-03T00:00:00.000Z' },
      { refId: 'y', score: 0.25, answeredAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(r.get('x')).toEqual({ attempts: 3, best: 1, latest: 0.75 });
    expect(r.get('y')).toEqual({ attempts: 1, best: 0.25, latest: 0.25 });
  });
});
