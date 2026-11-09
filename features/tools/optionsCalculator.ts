import { optionAtExpiry, type Limit } from '../../domain/calculators/options';
import { toFixedString, type Decimal } from '../../shared/decimal';
import { ok } from '../../shared/result';
import type { CalculatorDefinition } from './calculators';
import { fields } from './riskCalculators';

const SPEC = 'Fictional example: how many units one contract covers is set by each contract’s specification. Check the exact contract.';
const money = (d: Decimal) => toFixedString(d, 2);
const limit = (l: Limit, unlimited: string) => (l.kind === 'unlimited' ? unlimited : money(l.amount));
/** Short values, so the screen lists them with the figures rather than with the notes. */
const MONEYNESS = { in: 'In the money', at: 'At the money', out: 'Expires worthless' } as const;

/**
 * Option payoff at expiry (Options module). Every number is entered by the learner; the defaults are a fictional
 * example contract. It does not price an option before expiry.
 */
export const OPTIONS_CALCULATOR: CalculatorDefinition = {
  id: 'option_payoff',
  title: 'Option at expiry',
  formula:
    'Value at expiry per unit: call = price − strike, put = strike − price, never below 0. Buyer P/L = (value − premium) × units per contract × contracts. The seller’s P/L is the opposite. Breakeven: call = strike + premium, put = strike − premium.',
  fields: [
    { name: 'kind', label: 'Option type', kind: 'choice', defaultValue: 'call', choices: [{ value: 'call', label: 'Call' }, { value: 'put', label: 'Put' }] },
    { name: 'side', label: 'Position', kind: 'choice', defaultValue: 'buy', choices: [{ value: 'buy', label: 'Buy (hold)' }, { value: 'sell', label: 'Sell (write)' }] },
    { name: 'contracts', label: 'Contracts', kind: 'number', defaultValue: '1' },
    { name: 'multiplier', label: 'Units per contract', kind: 'number', defaultValue: '100', help: SPEC },
    { name: 'strike', label: 'Strike price', kind: 'number', defaultValue: '50' },
    { name: 'premium', label: 'Premium per unit', kind: 'number', defaultValue: '2' },
    { name: 'expiryPrice', label: 'Price of the underlying at expiry', kind: 'number', defaultValue: '56' },
  ],
  compute: (v) => {
    const f = fields(v, {
      contracts: ['Contracts'],
      multiplier: ['Units per contract'],
      strike: ['Strike price'],
      premium: ['Premium per unit'],
      expiryPrice: ['Price at expiry'],
    });
    if (!f.ok) return f;
    const kind = v.kind === 'put' ? 'put' : 'call';
    const side = v.side === 'sell' ? 'sell' : 'buy';
    const r = optionAtExpiry({ ...f.value, kind, side });
    if (!r.ok) return r;
    const x = r.value;
    const sellerCall = side === 'sell' && kind === 'call';
    return ok([
      { label: 'Profit or loss at expiry', value: money(x.profitLoss) },
      { label: 'At expiry', value: MONEYNESS[x.moneyness] },
      { label: 'Value per unit at expiry', value: money(x.intrinsicPerUnit) },
      { label: side === 'buy' ? 'Premium paid' : 'Premium received', value: money(x.premiumTotal) },
      { label: 'Breakeven price at expiry', value: x.breakEven ? toFixedString(x.breakEven, 2) : 'None above zero' },
      { label: 'Largest possible loss', value: limit(x.maxLoss, 'No fixed limit') },
      { label: 'Largest possible gain', value: limit(x.maxGain, 'No fixed limit') },
      ...(sellerCall
        ? [{ label: 'Selling a call you do not cover', value: 'The premium is the most you can make, and the loss has no ceiling. Brokers usually require approval and margin for this.' }]
        : []),
      { label: 'Only the value at expiry', value: 'Before expiry an option also has time value, so its price moves differently. This calculator does not estimate that.' },
    ]);
  },
};
