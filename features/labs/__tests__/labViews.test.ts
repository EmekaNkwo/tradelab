import { CHART_OVERLAY_IDS, CHART_PANE_IDS } from '../../../domain/market/chartIds';
import { DRILL_KINDS } from '../../../domain/market/drills';
import { SCENARIO_KINDS } from '../../../domain/market/scenarios';
import { createTestHarness } from '../../../testing/harness';
import { presetFromParams, presetToParams } from '../../practice/chartPreset';
import { byLevel, comparisonRows, conceptPerformance, redFlagOptions, scenarioOptions, statementRows } from '../labViews';

async function content() {
  return (await createTestHarness()).container.content;
}

describe('company comparison', () => {
  it('shows one value per company for every row, with n/a instead of a misleading ratio', async () => {
    const companies = (await content()).companies();
    expect(companies.length).toBeGreaterThanOrEqual(3);
    const rows = comparisonRows(companies);
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r.values).toHaveLength(companies.length);
      expect(r.values.every((v) => v.length > 0 && !/NaN|Infinity/.test(v))).toBe(true);
    }
    expect(comparisonRows([])).toHaveLength(rows.length);
  });

  it('formats money in millions, signed, and ratios as n/a on a loss', () => {
    const loss = {
      id: 'x',
      name: 'Loss Co (fictional)',
      sector: 's',
      summary: 's',
      assumptions: 'a',
      currency: 'USD' as const,
      sharePrice: 5,
      sharesOutstanding: 10,
      years: [
        { label: 'Year 1', revenue: 100, costOfSales: 80, operatingExpenses: 40, interest: 1, tax: 0, operatingCashFlow: -5, capitalExpenditure: 2, dividendsPaid: 0, cash: 10, debt: 1234.4, equity: 50 },
        { label: 'Year 2', revenue: 90, costOfSales: 80, operatingExpenses: 40, interest: 1, tax: 0, operatingCashFlow: -5, capitalExpenditure: 2, dividendsPaid: 0, cash: 10, debt: 1234.4, equity: 50 },
      ],
      notes: ['n'],
      glossaryIds: [],
    };
    const value = (label: string) => comparisonRows([loss]).find((r) => r.label === label)?.values[0];
    expect(value('Net income')).toBe('−$31m');
    expect(value('P/E ratio')).toBe('n/a');
    expect(value('Payout ratio')).toBe('n/a');
    expect(value('Revenue growth')).toBe('-10.0%');
    expect(value('Earnings per share')).toBe('−$3.10');
    expect(value('Net debt')).toBe('$1,224m');
    const statements = statementRows(loss);
    expect(statements.find((r) => r.label === 'Free cash flow')?.values).toEqual(['−$7m', '−$7m']);
    // A tiny negative rounds to zero and is shown without a minus sign.
    const nearZero = { ...loss, years: loss.years.map((y) => ({ ...y, debt: 9.7 })) };
    expect(comparisonRows([nearZero]).find((r) => r.label === 'Net debt')?.values[0]).toBe('$0m');
  });
});

describe('lab exercises and concepts', () => {
  it('red-flag and scenario options mark what should be picked', async () => {
    const c = await content();
    for (const rf of c.redFlagCases()) {
      const opts = redFlagOptions(rf);
      expect(opts.filter((o) => o.expected).length).toBeGreaterThanOrEqual(2);
      expect(opts.some((o) => !o.expected)).toBe(true);
    }
    for (const s of c.marketScenarios()) expect(scenarioOptions(s).some((o) => o.expected)).toBe(true);
    expect(c.marketScenarios('macro').every((s) => s.category === 'macro')).toBe(true);
    expect(c.marketScenarios('commodity').length).toBeGreaterThan(0);
  });

  it('every concept preset is a chart the app can draw, and every drill exists', async () => {
    const c = await content();
    for (const concept of [...c.labConcepts('technical'), ...c.labConcepts('fundamental')]) {
      if (concept.chart) {
        expect(SCENARIO_KINDS).toContain(concept.chart.scenario);
        expect(concept.chart.overlays.every((o) => (CHART_OVERLAY_IDS as readonly string[]).includes(o))).toBe(true);
        expect(CHART_PANE_IDS).toContain(concept.chart.pane);
        expect(presetFromParams(presetToParams(concept.chart))?.kind).toBe(concept.chart.scenario);
      }
      if (concept.drillKind) expect(DRILL_KINDS).toContain(concept.drillKind);
    }
  });

  it('groups concepts by level in order and skips empty levels', async () => {
    const c = await content();
    const technical = byLevel(c.labConcepts('technical'));
    expect(technical.map((g) => g.level)).toEqual(['beginner', 'intermediate', 'advanced']);
    for (const g of technical) expect(g.concepts.map((x) => x.order)).toEqual([...g.concepts.map((x) => x.order)].sort((a, b) => a - b));
    expect(byLevel([])).toEqual([]);
    expect(c.labConcept('nope')).toBeNull();
    expect(c.marketComparison().map((d) => d.order)).toEqual([...c.marketComparison().map((d) => d.order)].sort((a, b) => a - b));
  });

  it('reports a concept’s drill record and exercise records', async () => {
    const c = await content();
    const withCase = c.labConcepts('fundamental').find((x) => x.redFlagCaseIds.length > 0);
    if (!withCase) throw new Error('expected a red-flag concept');
    const caseId = withCase.redFlagCaseIds[0] as string;
    const p = conceptPerformance(withCase, [], new Map([[caseId, { attempts: 2, best: 1, latest: 0.5 }]]));
    expect(p.drill).toBeNull();
    expect(p.exercises.find((e) => e.id === caseId)?.record).toEqual({ attempts: 2, best: 1, latest: 0.5 });

    const withDrill = c.labConcepts('technical').find((x) => x.drillKind !== null);
    if (!withDrill) throw new Error('expected a concept with a drill');
    expect(conceptPerformance(withDrill, [{ kind: withDrill.drillKind as string, answered: 4, correct: 3 }], new Map()).drill).toEqual({ attempts: 4, correct: 3 });
    expect(conceptPerformance(withDrill, [], new Map()).drill).toEqual({ attempts: 0, correct: 0 });
  });
});

describe('chart presets from links', () => {
  it('drops unknown values so a bad link opens the normal Chart Lab', () => {
    expect(presetFromParams({})).toBeNull();
    expect(presetFromParams({ scenario: 'moon' })).toBeNull();
    expect(presetFromParams({ scenario: 'range', overlays: 'sma20,bogus,sma20', pane: 'x', lookFor: '  look  ' })).toEqual({
      kind: 'range',
      overlays: ['sma20'],
      pane: 'volume',
      lookFor: 'look',
    });
    expect(presetFromParams({ scenario: 'range', pane: 'rsi' })?.lookFor).toBeNull();
  });
});
