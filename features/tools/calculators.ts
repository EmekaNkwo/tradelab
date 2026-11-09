import {
  marginRequired,
  marginStatus,
  pipValue,
  positionSize,
  profitLoss,
  riskReward,
  type TradeSide,
} from '../../domain/calculators';
import type { AppError } from '../../shared/errors';
import { isFeatureEnabled } from '../../shared/featureFlags';
import { dec, toFixedString, type Decimal } from '../../shared/decimal';
import { ok, type Result } from '../../shared/result';
import { FUTURES_CALCULATOR } from './futuresCalculator';
import { OPTIONS_CALCULATOR } from './optionsCalculator';
import { RISK_CALCULATORS } from './riskCalculators';

/**
 * Calculator definitions for the calculators screen (spec §8.1 module 2, §20).
 * Each one lists its fields, turns the form values into domain inputs, and
 * formats the answer. The arithmetic itself lives in domain/calculators.
 */

export type CalculatorId =
  | 'pip_value'
  | 'position_size'
  | 'margin'
  | 'margin_status'
  | 'profit_loss'
  | 'risk_reward'
  | 'sizing_with_costs'
  | 'break_even'
  | 'expectancy'
  | 'recovery'
  | 'losing_streak'
  | 'risk_of_ruin'
  | 'compounding'
  | 'futures_contract'
  | 'option_payoff';

/** `signed` numbers may be negative (the decimal pad has no minus key, so they get a full keyboard). */
export type FieldKind = 'number' | 'signed' | 'pair' | 'currency' | 'side' | 'choice';

export interface CalculatorField {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly defaultValue: string;
  readonly help?: string;
  /** The options of a `choice` field. */
  readonly choices?: readonly { readonly value: string; readonly label: string }[];
  /** Shown only when this returns true for the current values. */
  readonly when?: (values: CalculatorValues) => boolean;
}

export type CalculatorValues = Readonly<Record<string, string>>;

export interface CalculatorLine {
  readonly label: string;
  readonly value: string;
}

export interface CalculatorDefinition {
  readonly id: CalculatorId;
  readonly title: string;
  readonly formula: string;
  readonly fields: readonly CalculatorField[];
  compute(values: CalculatorValues): Result<readonly CalculatorLine[], AppError>;
}

const money = (d: Decimal, currency: string) => `${toFixedString(d, 2)} ${currency.toUpperCase()}`;
const plain = (d: Decimal, dp: number) => toFixedString(d, dp);

const baseOf = (pair: string) => pair.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
const quoteOf = (pair: string) => pair.replace(/[^A-Za-z]/g, '').slice(3, 6).toUpperCase();
const account = (v: CalculatorValues) => (v.accountCurrency ?? '').trim().toUpperCase();
/** True when the account currency is neither side of the pair, so a conversion rate is needed. */
const isCross = (v: CalculatorValues) => {
  const pair = v.pair ?? '';
  return account(v) !== baseOf(pair) && account(v) !== quoteOf(pair);
};

const PAIR: CalculatorField = { name: 'pair', label: 'Currency pair', kind: 'pair', defaultValue: 'EUR/USD' };
const ACCOUNT: CalculatorField = { name: 'accountCurrency', label: 'Account currency', kind: 'currency', defaultValue: 'USD' };
const LOTS: CalculatorField = { name: 'lots', label: 'Size (lots)', kind: 'number', defaultValue: '0.10', help: '1 lot = 100,000 units of the base currency' };
const QUOTE_RATE: CalculatorField = {
  name: 'quoteToAccountRate',
  label: 'Value of 1 quote-currency unit in your account currency',
  kind: 'number',
  defaultValue: '',
  when: isCross,
};

const FOREX_CALCULATORS: readonly CalculatorDefinition[] = [
  {
    id: 'pip_value',
    title: 'Pip value',
    formula: 'Pip value = units × pip size, then converted to your account currency.',
    fields: [PAIR, LOTS, { name: 'price', label: 'Current price', kind: 'number', defaultValue: '1.10000' }, ACCOUNT, QUOTE_RATE],
    compute: (v) => {
      const r = pipValue({ pair: v.pair ?? '', lots: v.lots ?? '', price: v.price ?? '', accountCurrency: v.accountCurrency ?? '', quoteToAccountRate: v.quoteToAccountRate });
      if (!r.ok) return r;
      return ok([
        { label: 'Pip size', value: r.value.pipSize.toString() },
        { label: 'Units', value: plain(r.value.units, 0) },
        { label: `One pip in ${quoteOf(v.pair ?? '')}`, value: money(r.value.inQuote, quoteOf(v.pair ?? '')) },
        { label: 'One pip in your account currency', value: money(r.value.inAccount, account(v)) },
      ]);
    },
  },
  {
    id: 'position_size',
    title: 'Position size',
    formula: 'Lots = (balance × risk %) ÷ (stop in pips × pip value per lot), rounded down to a 0.01-lot step. Some brokers use larger steps; check yours.',
    fields: [
      { name: 'balance', label: 'Account balance', kind: 'number', defaultValue: '1000' },
      { name: 'riskPercent', label: 'Risk per trade (%)', kind: 'number', defaultValue: '1' },
      { name: 'stopPips', label: 'Stop loss distance (pips)', kind: 'number', defaultValue: '20' },
      { name: 'pipValuePerLot', label: 'Pip value for 1 lot (account currency)', kind: 'number', defaultValue: '10', help: 'Use the pip value calculator with size 1' },
    ],
    compute: (v) => {
      const r = positionSize({ balance: v.balance ?? '', riskPercent: v.riskPercent ?? '', stopPips: v.stopPips ?? '', pipValuePerLot: v.pipValuePerLot ?? '' });
      if (!r.ok) return r;
      return ok([
        { label: 'Money at risk', value: plain(r.value.riskAmount, 2) },
        { label: 'Position size', value: `${plain(r.value.lots, 2)} lots` },
        { label: 'Actual risk at that size', value: plain(r.value.actualRisk, 2) },
        ...(r.value.belowMinimumLot
          ? [
              {
                label: 'Note',
                value: `Even the smallest size, 0.01 lot, would risk ${plain(dec('0.01').times(dec(v.stopPips?.replace(',', '.') ?? '0')).times(dec(v.pipValuePerLot?.replace(',', '.') ?? '0')), 2)}, more than your limit. Skip the trade, or use a tighter stop only if your plan allows it.`,
              },
            ]
          : []),
      ]);
    },
  },
  {
    id: 'margin',
    title: 'Margin required',
    formula: 'Margin = trade value in your account currency ÷ leverage.',
    fields: [
      PAIR,
      LOTS,
      { name: 'price', label: 'Current price', kind: 'number', defaultValue: '1.10000' },
      { name: 'leverage', label: 'Leverage (the 30 in 1:30)', kind: 'number', defaultValue: '30' },
      ACCOUNT,
      { name: 'baseToAccountRate', label: 'Value of 1 base-currency unit in your account currency', kind: 'number', defaultValue: '', when: isCross },
    ],
    compute: (v) => {
      const r = marginRequired({ pair: v.pair ?? '', lots: v.lots ?? '', price: v.price ?? '', leverage: v.leverage ?? '', accountCurrency: v.accountCurrency ?? '', baseToAccountRate: v.baseToAccountRate });
      if (!r.ok) return r;
      return ok([
        { label: 'Trade value', value: money(r.value.notionalInAccount, account(v)) },
        { label: 'Margin required', value: money(r.value.margin, account(v)) },
      ]);
    },
  },
  {
    id: 'margin_status',
    title: 'Free margin and margin level',
    formula: 'Free margin = equity − used margin. Margin level = equity ÷ used margin × 100%.',
    fields: [
      { name: 'equity', label: 'Equity', kind: 'signed', defaultValue: '1000', help: 'Can be negative after a large loss' },
      { name: 'usedMargin', label: 'Used margin', kind: 'number', defaultValue: '250' },
    ],
    compute: (v) => {
      const r = marginStatus({ equity: v.equity ?? '', usedMargin: v.usedMargin ?? '' });
      if (!r.ok) return r;
      return ok([
        { label: 'Free margin', value: plain(r.value.freeMargin, 2) },
        { label: 'Margin level', value: r.value.marginLevelPercent ? `${plain(r.value.marginLevelPercent, 1)}%` : 'No open positions' },
      ]);
    },
  },
  {
    id: 'profit_loss',
    title: 'Profit or loss',
    formula: 'P/L = price move × units (reversed for a sell), then converted to your account currency.',
    fields: [
      PAIR,
      { name: 'side', label: 'Direction', kind: 'side', defaultValue: 'buy' },
      { name: 'entry', label: 'Entry price', kind: 'number', defaultValue: '1.10000' },
      { name: 'exit', label: 'Exit price', kind: 'number', defaultValue: '1.10200' },
      LOTS,
      ACCOUNT,
      QUOTE_RATE,
    ],
    compute: (v) => {
      const r = profitLoss({
        pair: v.pair ?? '',
        side: (v.side === 'sell' ? 'sell' : 'buy') as TradeSide,
        entry: v.entry ?? '',
        exit: v.exit ?? '',
        lots: v.lots ?? '',
        accountCurrency: v.accountCurrency ?? '',
        quoteToAccountRate: v.quoteToAccountRate,
      });
      if (!r.ok) return r;
      return ok([
        { label: 'Pips', value: plain(r.value.pips, 1) },
        { label: 'Result', value: money(r.value.inAccount, account(v)) },
      ]);
    },
  },
  {
    id: 'risk_reward',
    title: 'Risk to reward',
    formula: 'Ratio = distance to target ÷ distance to stop.',
    fields: [
      { name: 'side', label: 'Direction', kind: 'side', defaultValue: 'buy' },
      { name: 'entry', label: 'Entry price', kind: 'number', defaultValue: '1.10000' },
      { name: 'stop', label: 'Stop loss', kind: 'number', defaultValue: '1.09800' },
      { name: 'target', label: 'Take profit', kind: 'number', defaultValue: '1.10400' },
    ],
    compute: (v) => {
      const r = riskReward({ side: v.side === 'sell' ? 'sell' : 'buy', entry: v.entry ?? '', stop: v.stop ?? '', target: v.target ?? '' });
      if (!r.ok) return r;
      return ok([
        { label: 'Risk (price distance)', value: r.value.risk.toString() },
        { label: 'Reward (price distance)', value: r.value.reward.toString() },
        { label: 'Risk : reward', value: `1 : ${plain(r.value.ratio, 2)}` },
      ]);
    },
  },
];

/** Forex calculators (Phase 3), risk calculators (Phase 5), the futures contract calculator (Phase 7), then option payoff. */
export const CALCULATORS: readonly CalculatorDefinition[] = [...FOREX_CALCULATORS, ...RISK_CALCULATORS, FUTURES_CALCULATOR, OPTIONS_CALCULATOR];

/** The calculators whose feature is on (read on each call, so a flag change is seen). */
export function availableCalculators(): readonly CalculatorDefinition[] {
  return CALCULATORS.filter(
    (c) => (c !== FUTURES_CALCULATOR || isFeatureEnabled('futuresCalculator')) && (c !== OPTIONS_CALCULATOR || isFeatureEnabled('optionsCalculator')),
  );
}

export function calculator(id: string): CalculatorDefinition | null {
  return availableCalculators().find((c) => c.id === id) ?? null;
}

export function defaultValues(def: CalculatorDefinition): CalculatorValues {
  return Object.fromEntries(def.fields.map((f) => [f.name, f.defaultValue]));
}

export function visibleFields(def: CalculatorDefinition, values: CalculatorValues): readonly CalculatorField[] {
  return def.fields.filter((f) => !f.when || f.when(values));
}

/** A learner-facing message: the domain names fields by key, so swap in the form label. */
export function describeInputError(def: CalculatorDefinition, error: AppError): string {
  const field = def.fields.find((f) => error.issues?.includes(f.name));
  return field ? error.message.replace(field.name, field.label) : error.message;
}
