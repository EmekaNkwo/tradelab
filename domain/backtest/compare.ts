import type { BacktestCosts } from './costs';
import type { DatasetSpec } from './dataset';
import type { SplitRule } from './engine';
import { DEFINITION_LIMITS as L, PERIOD_KINDS, type ConditionGroup, type IndicatorOperand, type StrategyDefinition } from './model';
import { dec } from '../../shared/decimal';
import { canonicalJson, normaliseCosts } from './result';

/**
 * Comparison Studio rules (spec §16.4): what makes two runs comparable, and
 * the parameters a sensitivity check can vary. Nothing here ranks by profit.
 */

export interface ComparableRun {
  readonly definition: StrategyDefinition;
  readonly dataset: DatasetSpec;
  readonly capital: string;
  readonly costs: BacktestCosts;
  readonly split: SplitRule;
  /** Engine that produced the run; differing versions may follow different rules. */
  readonly engineVersion: number;
}

export interface ComparisonIssue {
  /** `refuse`: the runs are not shown side by side. `warn`: shown, with the reason. */
  readonly severity: 'refuse' | 'warn';
  readonly message: string;
}

export const COMPARE_LIMITS = { min: 2, max: 4 } as const;

const sameNumber = (v: string) => {
  try {
    return dec(v).toString();
  } catch {
    return v;
  }
};

const allSame = <T>(xs: readonly T[], f: (x: T) => unknown) => new Set(xs.map((x) => canonicalJson(f(x)))).size <= 1;

export function comparisonIssues(runs: readonly ComparableRun[]): readonly ComparisonIssue[] {
  if (runs.length < COMPARE_LIMITS.min || runs.length > COMPARE_LIMITS.max) {
    return [{ severity: 'refuse', message: `Choose ${COMPARE_LIMITS.min} to ${COMPARE_LIMITS.max} runs to compare` }];
  }
  const issues: ComparisonIssue[] = [];
  if (!allSame(runs, (r) => r.dataset.instrumentId)) {
    issues.push({ severity: 'refuse', message: 'These runs are on different markets. Spreads, leverage and behaviour differ, so the numbers are not comparable. Compare runs on the same market.' });
  }
  if (!allSame(runs, (r) => r.dataset.timeframe)) {
    issues.push({ severity: 'refuse', message: 'These runs use different timeframes, so their trades and holding times are not comparable. Compare runs on the same timeframe.' });
  }
  if (!allSame(runs, (r) => r.dataset.contentHash ?? r.dataset.datasetId ?? null)) {
    issues.push({ severity: 'warn', message: 'Some runs use different data sources (simulated, or different real data sets). Differences may come from the data, not the rules.' });
  } else if (!allSame(runs, (r) => [r.dataset.seed, r.dataset.candles])) {
    issues.push({ severity: 'warn', message: 'The runs use different data (another seed or length). Differences may come from the data, not the rules.' });
  }
  if (!allSame(runs, (r) => r.engineVersion)) issues.push({ severity: 'warn', message: 'These runs were made by different versions of the backtest engine, whose fill rules may differ. Rerun the older ones before comparing closely.' });
  if (!allSame(runs, (r) => normaliseCosts(r.costs))) issues.push({ severity: 'warn', message: 'The runs use different costs. A strategy can look better only because it was charged less.' });
  if (!allSame(runs, (r) => sameNumber(r.capital))) issues.push({ severity: 'warn', message: 'The runs start with different capital, so money figures differ; compare the percent and R figures instead.' });
  if (!allSame(runs, (r) => r.split)) issues.push({ severity: 'warn', message: 'The runs use different in-sample / out-of-sample splits.' });
  if (!allSame(runs, (r) => r.definition.riskPercent)) issues.push({ severity: 'warn', message: 'The runs risk a different % per trade, which changes returns and drawdowns without changing the rules’ edge. Compare the R figures.' });
  return issues;
}

export interface SensitivityParameter {
  readonly id: string;
  readonly label: string;
  readonly base: number;
  readonly values: readonly number[];
}

const clamp = (v: number, r: { readonly min: number; readonly max: number }) => Math.min(r.max, Math.max(r.min, v));

function spread(base: number, r: { readonly min: number; readonly max: number }, whole: boolean): readonly number[] {
  const raw = [0.6, 0.8, 1, 1.2, 1.4].map((f) => clamp(whole ? Math.round(base * f) : Math.round(base * f * 10) / 10, r));
  return [...new Set(raw)];
}

function groupOperands(g: ConditionGroup | null, prefix: string): { id: string; operand: IndicatorOperand }[] {
  return (g?.conditions ?? []).flatMap((c, i) => [
    { id: `${prefix}.${i}.left`, operand: c.left },
    ...(c.right.kind === 'indicator' ? [{ id: `${prefix}.${i}.right`, operand: c.right }] : []),
  ]);
}

const GROUPS = ['longEntry', 'shortEntry', 'longExit', 'shortExit'] as const;
type Group = (typeof GROUPS)[number];

/** Numeric settings that can be varied, each with up to five nearby values (the current one included). */
export function sensitivityParameters(d: StrategyDefinition): readonly SensitivityParameter[] {
  const out: SensitivityParameter[] = [];
  if (d.stop.kind === 'atr') out.push({ id: 'stop.multiple', label: 'Stop: ATR multiple', base: d.stop.multiple, values: spread(d.stop.multiple, L.atrMultiple, false) });
  if (d.stop.kind === 'percent') out.push({ id: 'stop.percent', label: 'Stop: distance %', base: d.stop.percent, values: spread(d.stop.percent, L.stopPercent, false) });
  if (d.stop.kind === 'channel') out.push({ id: 'stop.period', label: 'Stop: channel period', base: d.stop.period, values: spread(d.stop.period, L.period, true) });
  if (d.target.kind === 'r_multiple') out.push({ id: 'target.r', label: 'Target (R)', base: d.target.r, values: spread(d.target.r, L.targetR, false) });
  // One entry per indicator and period: changing it moves that value in every rule, so entries and exits stay consistent.
  const seen = new Set<string>();
  for (const prefix of GROUPS) {
    for (const { id, operand } of groupOperands(d[prefix], prefix)) {
      if (!PERIOD_KINDS.has(operand.indicator) || operand.period === null) continue;
      const k = `${operand.indicator}:${operand.period}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id, label: `${operand.indicator.replace(/_/g, ' ').toUpperCase()} ${operand.period}: period`, base: operand.period, values: spread(operand.period, L.period, true) });
    }
  }
  return out;
}

/** A copy of the definition with one parameter changed. The original is never modified. */
export function withParameter(d: StrategyDefinition, id: string, value: number): StrategyDefinition {
  if (id === 'stop.multiple' && d.stop.kind === 'atr') return { ...d, stop: { ...d.stop, multiple: value } };
  if (id === 'stop.percent' && d.stop.kind === 'percent') return { ...d, stop: { ...d.stop, percent: value } };
  if (id === 'stop.period' && d.stop.kind === 'channel') return { ...d, stop: { ...d.stop, period: value } };
  if (id === 'target.r' && d.target.kind === 'r_multiple') return { ...d, target: { ...d.target, r: value } };
  const [prefix, index, side] = id.split('.');
  if (!prefix || !(GROUPS as readonly string[]).includes(prefix)) return d;
  const target = d[prefix as Group]?.conditions[Number(index)]?.[side === 'right' ? 'right' : 'left'];
  if (!target || target.kind !== 'indicator') return d;
  // Every operand with the same indicator and period, in every rule, moves together.
  const same = (o: IndicatorOperand) => o.indicator === target.indicator && o.period === target.period;
  const move = (g: ConditionGroup | null): ConditionGroup | null =>
    g && {
      ...g,
      conditions: g.conditions.map((c) => ({
        ...c,
        left: same(c.left) ? { ...c.left, period: value } : c.left,
        right: c.right.kind === 'indicator' && same(c.right) ? { ...c.right, period: value } : c.right,
      })),
    };
  return { ...d, longEntry: move(d.longEntry), shortEntry: move(d.shortEntry), longExit: move(d.longExit), shortExit: move(d.shortExit) };
}
