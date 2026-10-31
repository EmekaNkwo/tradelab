import type { CompanyYear, FictionalCompany } from '../models/labs';

/**
 * Figures worked out from a fictional company's statements (spec §10.2, §12).
 * Ratios that make no sense (a P/E on a loss, a margin on no revenue) are null
 * rather than a misleading number.
 */
export interface YearMetrics {
  readonly label: string;
  readonly revenue: number;
  readonly grossProfit: number;
  readonly operatingProfit: number;
  readonly netIncome: number;
  readonly grossMargin: number;
  readonly operatingMargin: number;
  readonly netMargin: number;
  readonly freeCashFlow: number;
  readonly netDebt: number;
  /** Net income ÷ equity; null when equity is zero or negative. */
  readonly returnOnEquity: number | null;
  /** Operating profit ÷ (debt + equity); null when that is zero or negative. */
  readonly returnOnCapital: number | null;
  /** Operating cash flow ÷ net income; null on a loss. Well below 1 means profit is not turning into cash. */
  readonly cashConversion: number | null;
  /** Revenue change against the year before; null for the first year. */
  readonly revenueGrowth: number | null;
  readonly eps: number;
}

export interface CompanyMetrics {
  readonly years: readonly YearMetrics[];
  readonly latest: YearMetrics;
  /** Price × shares, in millions. */
  readonly marketCap: number;
  /** Market cap + net debt, in millions. */
  readonly enterpriseValue: number;
  /** null when the latest EPS is zero or negative. */
  readonly peRatio: number | null;
  /** EPS ÷ price; negative on a loss. */
  readonly earningsYield: number;
  readonly dividendYield: number;
  /** Dividends ÷ net income; null on a loss. */
  readonly payoutRatio: number | null;
  /** Net debt ÷ operating profit; null when operating profit is zero or negative. */
  readonly netDebtToOperatingProfit: number | null;
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function yearMetrics(y: CompanyYear, previous: CompanyYear | undefined, shares: number): YearMetrics {
  const grossProfit = y.revenue - y.costOfSales;
  const operatingProfit = grossProfit - y.operatingExpenses;
  const netIncome = operatingProfit - y.interest - y.tax;
  return {
    label: y.label,
    revenue: y.revenue,
    grossProfit,
    operatingProfit,
    netIncome,
    grossMargin: grossProfit / y.revenue,
    operatingMargin: operatingProfit / y.revenue,
    netMargin: netIncome / y.revenue,
    freeCashFlow: y.operatingCashFlow - y.capitalExpenditure,
    netDebt: y.debt - y.cash,
    returnOnEquity: ratio(netIncome, y.equity),
    returnOnCapital: ratio(operatingProfit, y.debt + y.equity),
    cashConversion: ratio(y.operatingCashFlow, netIncome),
    revenueGrowth: previous ? (y.revenue - previous.revenue) / previous.revenue : null,
    eps: netIncome / shares,
  };
}

export function companyMetrics(c: FictionalCompany): CompanyMetrics {
  const years = c.years.map((y, i) => yearMetrics(y, c.years[i - 1], c.sharesOutstanding));
  const latest = years[years.length - 1] as YearMetrics;
  const latestYear = c.years[c.years.length - 1] as CompanyYear;
  const marketCap = c.sharePrice * c.sharesOutstanding;
  return {
    years,
    latest,
    marketCap,
    enterpriseValue: marketCap + latest.netDebt,
    peRatio: ratio(c.sharePrice, latest.eps),
    earningsYield: latest.eps / c.sharePrice,
    dividendYield: latestYear.dividendsPaid / marketCap,
    payoutRatio: ratio(latestYear.dividendsPaid, latest.netIncome),
    netDebtToOperatingProfit: ratio(latest.netDebt, latest.operatingProfit),
  };
}
