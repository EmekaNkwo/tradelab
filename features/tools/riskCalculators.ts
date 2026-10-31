import {
  breakEvenWinRate,
  chanceOfLosingStreak,
  compound,
  expectancyR,
  recoveryNeeded,
  simulateRuin,
  sizePosition,
} from '../../domain/risk';
import { dec, isTypedNumber, toFixedString, type Decimal } from '../../shared/decimal';
import { validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import type { CalculatorDefinition, CalculatorValues } from './calculators';

/**
 * Risk education calculators (spec §19). They do arithmetic on the learner's
 * own numbers; the defaults are examples to change, not recommendations.
 */

export interface FieldOpts {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly signed?: boolean;
}

const field = (v: CalculatorValues, name: string, label: string, opts: FieldOpts = {}): Result<Decimal, AppError> => {
  const t = (v[name] ?? '').trim().replace(',', '.');
  if (!isTypedNumber(t)) return err(validationError(`${label} must be a number`, { issues: [name] }));
  const d = dec(t);
  if (!opts.signed && d.isNegative()) return err(validationError(`${label} cannot be negative`, { issues: [name] }));
  if (opts.min !== undefined && d.lt(opts.min)) return err(validationError(`${label} must be at least ${opts.min}`, { issues: [name] }));
  if (opts.max !== undefined && d.gt(opts.max)) return err(validationError(`${label} must be at most ${opts.max}`, { issues: [name] }));
  if (opts.integer && !d.isInteger()) return err(validationError(`${label} must be a whole number`, { issues: [name] }));
  return ok(d);
};

/** Reads several fields at once; the first problem wins. */
export function fields<K extends string>(v: CalculatorValues, specs: Record<K, readonly [string, FieldOpts?]>): Result<Record<K, Decimal>, AppError> {
  const out = {} as Record<K, Decimal>;
  for (const [name, [label, opts]] of Object.entries(specs) as [K, readonly [string, FieldOpts?]][]) {
    const r = field(v, name, label, opts);
    if (!r.ok) return r;
    out[name] = r.value;
  }
  return ok(out);
}

const percent = (d: Decimal, dp = 1) => `${toFixedString(d.times(100), dp)}%`;
const EXAMPLE = 'An example value: change it to your own.';

export const RISK_CALCULATORS: readonly CalculatorDefinition[] = [
  {
    id: 'sizing_with_costs',
    title: 'Position size with costs',
    formula: 'Size = money at risk ÷ (loss per lot at the stop + spread + commission), rounded down to the size step.',
    fields: [
      { name: 'balance', label: 'Account balance', kind: 'number', defaultValue: '10000' },
      { name: 'riskPercent', label: 'Risk per trade (%)', kind: 'number', defaultValue: '1', help: EXAMPLE },
      { name: 'side', label: 'Direction', kind: 'side', defaultValue: 'buy' },
      { name: 'entry', label: 'Entry price', kind: 'number', defaultValue: '1.10000' },
      { name: 'stop', label: 'Stop loss', kind: 'number', defaultValue: '1.09500' },
      { name: 'target', label: 'Take profit (0 for none)', kind: 'number', defaultValue: '1.11000' },
      { name: 'contractSize', label: 'Units per lot', kind: 'number', defaultValue: '100000' },
      { name: 'pipSize', label: 'Pip or tick size', kind: 'number', defaultValue: '0.0001' },
      { name: 'spreadPips', label: 'Spread (pips)', kind: 'number', defaultValue: '1', help: `${EXAMPLE} Use your demo account's spread.` },
      { name: 'commission', label: 'Commission per lot, round trip', kind: 'number', defaultValue: '7', help: `${EXAMPLE} Use your demo account's commission.` },
      { name: 'rate', label: 'Value of 1 quote unit in your account currency', kind: 'number', defaultValue: '1', help: '1 when your account is in the quote currency' },
      { name: 'lotStep', label: 'Size step (lots)', kind: 'number', defaultValue: '0.01' },
    ],
    compute: (v) => {
      const f = fields(v, {
        balance: ['Account balance'],
        riskPercent: ['Risk per trade'],
        entry: ['Entry price'],
        stop: ['Stop loss'],
        target: ['Take profit'],
        contractSize: ['Units per lot'],
        pipSize: ['Pip size'],
        spreadPips: ['Spread'],
        commission: ['Commission'],
        rate: ['Conversion rate'],
        lotStep: ['Size step'],
      });
      if (!f.ok) return f;
      const x = f.value;
      const r = sizePosition({
        balance: x.balance,
        riskPercent: x.riskPercent,
        side: v.side === 'sell' ? 'sell' : 'buy',
        entry: x.entry,
        stop: x.stop,
        target: x.target.isZero() ? null : x.target,
        spec: { contractSize: x.contractSize, pipSize: x.pipSize, lotStep: x.lotStep, minLot: x.lotStep },
        quoteToAccount: x.rate,
        costs: { spreadPips: x.spreadPips, commissionPerLot: x.commission },
      });
      if (!r.ok) return r;
      const s = r.value;
      return ok([
        { label: 'Money at risk', value: toFixedString(s.moneyAtRisk, 2) },
        { label: 'Stop distance (pips)', value: toFixedString(s.stopDistancePips, 1) },
        { label: 'Size', value: s.belowMinimum ? '0 lots: below the smallest size. At this risk and stop the trade cannot be sized; skip it rather than raise the risk.' : `${s.lots.toString()} lots` },
        { label: 'Loss at stop, before costs', value: toFixedString(s.grossLossAtStop, 2) },
        { label: 'Loss at stop, with costs', value: toFixedString(s.netLossAtStop, 2) },
        ...(s.netProfitAtTarget ? [{ label: 'Profit at target, after costs', value: toFixedString(s.netProfitAtTarget, 2) }] : []),
        ...(s.rewardToRisk ? [{ label: 'Reward : risk', value: `${toFixedString(s.rewardToRisk, 2)} : 1` }] : []),
        ...s.assumptions.map((a, k) => ({ label: `Assumption ${k + 1}`, value: a })),
      ]);
    },
  },
  {
    id: 'break_even',
    title: 'Break-even win rate',
    formula: 'Win rate needed = 1 ÷ (1 + reward:risk), before costs.',
    fields: [{ name: 'rr', label: 'Reward : risk (e.g. 2 for 2:1)', kind: 'number', defaultValue: '2' }],
    compute: (v) => {
      const rr = field(v, 'rr', 'Reward : risk');
      if (!rr.ok) return rr;
      const w = breakEvenWinRate(rr.value);
      if (!w) return err(validationError('Reward : risk must be more than zero', { issues: ['rr'] }));
      return ok([
        { label: 'Win rate needed to break even', value: percent(w) },
        { label: 'Note', value: 'Costs raise this. Winning more often than this is not guaranteed by any method.' },
      ]);
    },
  },
  {
    id: 'expectancy',
    title: 'Expected value per trade',
    formula: 'Expectancy (R) = win rate × average win − loss rate × average loss.',
    fields: [
      { name: 'winRate', label: 'Win rate (%)', kind: 'number', defaultValue: '40', help: EXAMPLE },
      { name: 'avgWin', label: 'Average win (R)', kind: 'number', defaultValue: '2' },
      { name: 'avgLoss', label: 'Average loss (R)', kind: 'number', defaultValue: '1' },
    ],
    compute: (v) => {
      const f = fields(v, { winRate: ['Win rate', { max: 100 }], avgWin: ['Average win'], avgLoss: ['Average loss'] });
      if (!f.ok) return f;
      const e = expectancyR(f.value.winRate.div(100), f.value.avgWin, f.value.avgLoss);
      return ok([
        { label: 'Expectancy per trade', value: `${toFixedString(e, 2)} R` },
        { label: 'Note', value: 'This is arithmetic on your inputs. Real results vary, and past results do not guarantee future ones.' },
      ]);
    },
  },
  {
    id: 'recovery',
    title: 'Drawdown and recovery',
    formula: 'Gain needed = drawdown ÷ (1 − drawdown).',
    fields: [{ name: 'drawdown', label: 'Drawdown (%)', kind: 'number', defaultValue: '20' }],
    compute: (v) => {
      const d = field(v, 'drawdown', 'Drawdown', { max: 99.99 });
      if (!d.ok) return d;
      const g = recoveryNeeded(d.value.div(100));
      if (!g) return err(validationError('Drawdown must be below 100%', { issues: ['drawdown'] }));
      return ok([{ label: 'Gain needed to get back', value: percent(g) }]);
    },
  },
  {
    id: 'losing_streak',
    title: 'Losing streak chance',
    formula: 'Exact chance of at least one run of N losses in a row, if each trade loses independently.',
    fields: [
      { name: 'lossRate', label: 'Chance a trade loses (%)', kind: 'number', defaultValue: '50', help: EXAMPLE },
      { name: 'trades', label: 'Number of trades', kind: 'number', defaultValue: '100' },
      { name: 'streak', label: 'Losses in a row', kind: 'number', defaultValue: '5' },
    ],
    compute: (v) => {
      const f = fields(v, { lossRate: ['Loss chance', { max: 100 }], trades: ['Number of trades', { min: 1, max: 5000, integer: true }], streak: ['Losses in a row', { min: 1, max: 100, integer: true }] });
      if (!f.ok) return f;
      const p = chanceOfLosingStreak(f.value.lossRate.toNumber() / 100, f.value.trades.toNumber(), f.value.streak.toNumber());
      return ok([
        { label: 'Chance of at least one such streak', value: `${(p * 100).toFixed(1)}%` },
        { label: 'Why it matters', value: 'Streaks are normal even for a sound plan. Size so a streak does not knock you out.' },
      ]);
    },
  },
  {
    id: 'risk_of_ruin',
    title: 'Risk of ruin (simulated)',
    formula: 'Share of 2,000 simulated runs, risking a fixed share of equity each trade, that fall to the ruin level.',
    fields: [
      { name: 'winRate', label: 'Win rate (%)', kind: 'number', defaultValue: '45', help: EXAMPLE },
      { name: 'rr', label: 'Reward : risk', kind: 'number', defaultValue: '1.5' },
      { name: 'risk', label: 'Risk per trade (% of equity)', kind: 'number', defaultValue: '1' },
      { name: 'ruin', label: 'Ruin level: drawdown (%)', kind: 'number', defaultValue: '50' },
      { name: 'trades', label: 'Number of trades', kind: 'number', defaultValue: '200' },
    ],
    compute: (v) => {
      const f = fields(v, {
        winRate: ['Win rate', { max: 100 }],
        rr: ['Reward : risk', { min: 0.01, max: 20 }],
        risk: ['Risk per trade', { min: 0.01, max: 100 }],
        ruin: ['Ruin level', { min: 1, max: 100 }],
        trades: ['Number of trades', { min: 1, max: 2000, integer: true }],
      });
      if (!f.ok) return f;
      const share = simulateRuin({
        winRate: f.value.winRate.toNumber() / 100,
        rewardToRisk: f.value.rr.toNumber(),
        riskFraction: f.value.risk.toNumber() / 100,
        ruinDrawdown: f.value.ruin.toNumber() / 100,
        trades: f.value.trades.toNumber(),
      });
      return ok([
        { label: 'Simulated runs that hit the ruin level', value: `${(share * 100).toFixed(1)}%` },
        { label: 'Note', value: 'An illustration from simulated coin flips, not a forecast. Try a smaller risk per trade and compare.' },
      ]);
    },
  },
  {
    id: 'compounding',
    title: 'Compounding',
    formula: 'End = start × (1 + rate) ^ periods.',
    fields: [
      { name: 'start', label: 'Starting amount', kind: 'number', defaultValue: '1000' },
      { name: 'rate', label: 'Change per period (%)', kind: 'signed', defaultValue: '1', help: 'Negative for a loss. An example, not a typical return.' },
      { name: 'periods', label: 'Periods', kind: 'number', defaultValue: '12' },
    ],
    compute: (v) => {
      const f = fields(v, { start: ['Starting amount'], rate: ['Change per period', { signed: true, min: -100, max: 1000 }], periods: ['Periods', { max: 1000, integer: true }] });
      if (!f.ok) return f;
      return ok([{ label: 'Ending amount', value: toFixedString(compound(f.value.start, f.value.rate.div(100), f.value.periods.toNumber()), 2) }]);
    },
  },
];
