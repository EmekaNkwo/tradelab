import { companyMetrics, type CompanyMetrics, type JudgedOption, type LabRecord } from '../../domain/labs';
import type { FictionalCompany, LabConcept, MarketScenario, RedFlagCase } from '../../domain/models/labs';

/** Formatting for the company comparison. Figures are in millions of the company's currency. */
const signed = (rounded: number, text: string) => `${rounded < 0 ? '−' : ''}$${text}`;
const millions = (n: number) => {
  const r = Math.round(n);
  return `${signed(r, Math.abs(r).toLocaleString('en-US'))}m`;
};
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
const times = (n: number | null) => (n === null ? 'n/a' : `${n.toFixed(1)}×`);
const perShare = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return signed(r, Math.abs(r).toFixed(2));
};

export interface ComparisonRow {
  readonly label: string;
  /** What the row means, for the learner. */
  readonly help: string;
  /** One value per company, in the order given. */
  readonly values: readonly string[];
}

type Picker = (m: CompanyMetrics, c: FictionalCompany) => string;

const ROWS: readonly { readonly label: string; readonly help: string; readonly pick: Picker }[] = [
  { label: 'Revenue (latest)', help: 'Sales in the latest year.', pick: (m) => millions(m.latest.revenue) },
  { label: 'Revenue growth', help: 'Change in sales against the year before.', pick: (m) => pct(m.latest.revenueGrowth) },
  { label: 'Gross margin', help: 'Gross profit ÷ revenue.', pick: (m) => pct(m.latest.grossMargin) },
  { label: 'Operating margin', help: 'Operating profit ÷ revenue.', pick: (m) => pct(m.latest.operatingMargin) },
  { label: 'Net income', help: 'Profit after interest and tax.', pick: (m) => millions(m.latest.netIncome) },
  { label: 'Free cash flow', help: 'Operating cash flow − capital spending.', pick: (m) => millions(m.latest.freeCashFlow) },
  { label: 'Cash conversion', help: 'Operating cash flow ÷ net income. Well below 1× means profit is not arriving as cash. n/a on a loss.', pick: (m) => times(m.latest.cashConversion) },
  { label: 'Net debt', help: 'Debt − cash. Negative means more cash than debt.', pick: (m) => millions(m.latest.netDebt) },
  { label: 'Net debt ÷ operating profit', help: 'Years of operating profit the net debt equals. n/a when operating profit is zero or less.', pick: (m) => times(m.netDebtToOperatingProfit) },
  { label: 'Return on equity', help: 'Net income ÷ equity. n/a when equity is zero or less.', pick: (m) => pct(m.latest.returnOnEquity) },
  { label: 'Return on capital', help: 'Operating profit ÷ (debt + equity).', pick: (m) => pct(m.latest.returnOnCapital) },
  { label: 'Share price', help: 'Fictional price used for the valuation rows.', pick: (_m, c) => perShare(c.sharePrice) },
  { label: 'Earnings per share', help: 'Net income ÷ shares.', pick: (m) => perShare(m.latest.eps) },
  { label: 'Market capitalisation', help: 'Price × shares.', pick: (m) => millions(m.marketCap) },
  { label: 'P/E ratio', help: 'Price ÷ earnings per share. n/a on a loss. A low P/E can be cheap for a reason.', pick: (m) => times(m.peRatio) },
  { label: 'Earnings yield', help: 'Earnings per share ÷ price: the P/E turned upside down.', pick: (m) => pct(m.earningsYield) },
  { label: 'Dividend yield', help: 'Dividends ÷ market capitalisation.', pick: (m) => pct(m.dividendYield) },
  { label: 'Payout ratio', help: 'Dividends ÷ net income. Above 100% means paying out more than it earned. n/a on a loss.', pick: (m) => pct(m.payoutRatio) },
];

export function comparisonRows(companies: readonly FictionalCompany[]): readonly ComparisonRow[] {
  const metrics = companies.map((c) => companyMetrics(c));
  return ROWS.map((r) => ({ label: r.label, help: r.help, values: companies.map((c, i) => r.pick(metrics[i] as CompanyMetrics, c)) }));
}

/** One company's statements, year by year, for its detail view. */
export function statementRows(company: FictionalCompany): readonly ComparisonRow[] {
  const m = companyMetrics(company);
  const per = (label: string, help: string, f: (i: number) => string): ComparisonRow => ({ label, help, values: m.years.map((_, i) => f(i)) });
  const y = (i: number) => company.years[i] as FictionalCompany['years'][number];
  const ym = (i: number) => m.years[i] as CompanyMetrics['years'][number];
  return [
    per('Revenue', 'Sales.', (i) => millions(y(i).revenue)),
    per('Gross profit', 'Revenue − cost of sales.', (i) => millions(ym(i).grossProfit)),
    per('Operating profit', 'Gross profit − operating expenses.', (i) => millions(ym(i).operatingProfit)),
    per('Net income', 'Operating profit − interest − tax.', (i) => millions(ym(i).netIncome)),
    per('Operating cash flow', 'Cash the business generated from operations.', (i) => millions(y(i).operatingCashFlow)),
    per('Capital spending', 'Cash spent on equipment and other long-term assets.', (i) => millions(y(i).capitalExpenditure)),
    per('Free cash flow', 'Operating cash flow − capital spending.', (i) => millions(ym(i).freeCashFlow)),
    per('Dividends paid', 'Cash paid to shareholders.', (i) => millions(y(i).dividendsPaid)),
    per('Cash', 'On the balance sheet at year end.', (i) => millions(y(i).cash)),
    per('Debt', 'On the balance sheet at year end.', (i) => millions(y(i).debt)),
    per('Equity', 'Assets − liabilities.', (i) => millions(y(i).equity)),
  ];
}

export const redFlagOptions = (c: RedFlagCase): readonly JudgedOption[] => c.signs.map((s) => ({ id: s.id, expected: s.isRedFlag }));
export const scenarioOptions = (s: MarketScenario): readonly JudgedOption[] => s.reactions.map((r) => ({ id: r.id, expected: r.plausible }));

/** The learner's record on what a concept practises (spec §11 "recorded performance"). */
export interface ConceptPerformance {
  readonly drill: { readonly attempts: number; readonly correct: number } | null;
  readonly exercises: readonly { readonly id: string; readonly record: LabRecord | null }[];
}

/** Scored drill answers per drill kind (neutral answers such as waiting are left out). */
export interface DrillTally {
  readonly kind: string;
  readonly answered: number;
  readonly correct: number;
}

export function conceptPerformance(concept: LabConcept, drills: readonly DrillTally[], records: ReadonlyMap<string, LabRecord>): ConceptPerformance {
  const tally = concept.drillKind ? drills.find((d) => d.kind === concept.drillKind) : undefined;
  return {
    drill: concept.drillKind ? { attempts: tally?.answered ?? 0, correct: tally?.correct ?? 0 } : null,
    exercises: [...concept.redFlagCaseIds, ...concept.scenarioIds].map((id) => ({ id, record: records.get(id) ?? null })),
  };
}

export const LEVEL_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

/** Concepts grouped by level, in level order, skipping empty levels. */
export function byLevel(concepts: readonly LabConcept[]): readonly { readonly level: LabConcept['level']; readonly title: string; readonly concepts: readonly LabConcept[] }[] {
  return (['beginner', 'intermediate', 'advanced'] as const)
    .map((level) => ({ level, title: LEVEL_LABELS[level], concepts: concepts.filter((c) => c.level === level) }))
    .filter((g) => g.concepts.length > 0);
}
