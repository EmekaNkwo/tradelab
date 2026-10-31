import { futuresTrade } from '../../domain/calculators/futures';
import { toFixedString, type Decimal } from '../../shared/decimal';
import { ok } from '../../shared/result';
import type { CalculatorDefinition } from './calculators';
import { fields } from './riskCalculators';

const SPEC = 'Fictional example spec: use the exact contract’s specification from its exchange.';
const money = (d: Decimal) => toFixedString(d, 2);
const UNREACHABLE = 'Not reachable: the price would have to fall to zero or below';
const price = (d: Decimal | null) => (d === null ? UNREACHABLE : d.toString());

/**
 * Futures contract calculator (spec §10.5). Every spec is entered by the
 * learner; the defaults are a fictional example contract, not a real one.
 */
export const FUTURES_CALCULATOR: CalculatorDefinition = {
  id: 'futures_contract',
  title: 'Futures contract',
  formula:
    'Point value = tick value ÷ tick size. P/L = ticks moved × tick value × contracts. Notional = price × point value × contracts. Margin call when the balance plus P/L falls to the maintenance margin.',
  fields: [
    { name: 'side', label: 'Direction', kind: 'side', defaultValue: 'buy' },
    { name: 'contracts', label: 'Contracts', kind: 'number', defaultValue: '1' },
    { name: 'tickSize', label: 'Tick size (smallest price step)', kind: 'number', defaultValue: '0.25', help: SPEC },
    { name: 'tickValue', label: 'Tick value per contract', kind: 'number', defaultValue: '5', help: SPEC },
    { name: 'entry', label: 'Entry price', kind: 'number', defaultValue: '4000' },
    { name: 'exit', label: 'Exit price', kind: 'number', defaultValue: '4010' },
    { name: 'initialMargin', label: 'Initial margin per contract', kind: 'number', defaultValue: '5000', help: `${SPEC} Margin is set by the exchange and broker and can change.` },
    { name: 'maintenanceMargin', label: 'Maintenance margin per contract', kind: 'number', defaultValue: '4000', help: SPEC },
    { name: 'balance', label: 'Account balance before the trade', kind: 'number', defaultValue: '10000' },
  ],
  compute: (v) => {
    const f = fields(v, {
      contracts: ['Contracts'],
      tickSize: ['Tick size'],
      tickValue: ['Tick value'],
      entry: ['Entry price'],
      exit: ['Exit price'],
      initialMargin: ['Initial margin'],
      maintenanceMargin: ['Maintenance margin'],
      balance: ['Account balance'],
    });
    if (!f.ok) return f;
    const r = futuresTrade({ ...f.value, side: v.side === 'sell' ? 'sell' : 'buy' });
    if (!r.ok) return r;
    const x = r.value;
    return ok([
      { label: 'Value of one point, per contract', value: money(x.pointValue) },
      { label: 'Ticks moved in your favour', value: x.ticks.toString() },
      { label: 'Profit or loss', value: money(x.profitLoss) },
      { label: 'Notional value (what you control)', value: money(x.notional) },
      { label: 'Initial margin posted', value: money(x.initialMarginTotal) },
      { label: 'Leverage (notional ÷ margin)', value: `${toFixedString(x.leverage, 1)} : 1` },
      { label: 'Margin call if price reaches', value: price(x.marginCallPrice) },
      { label: 'Whole balance lost if price reaches', value: price(x.balanceGonePrice) },
      { label: 'Balance after the trade', value: money(x.equityAfter) },
      {
        label: 'Margin is not the maximum loss',
        value: 'Price can gap past the margin-call and balance-gone levels. Losses can be larger than the margin posted, and larger than the whole balance.',
      },
    ]);
  },
};
