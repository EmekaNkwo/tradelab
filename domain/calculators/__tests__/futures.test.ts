import { dec } from '../../../shared/decimal';
import { futuresTrade, type FuturesInput } from '../futures';

// Fictional specs: tick 0.25 worth 5 per contract (so 20 per point), margin 5,000 / 4,000.
const base: FuturesInput = {
  side: 'buy',
  contracts: dec(2),
  tickSize: dec('0.25'),
  tickValue: dec(5),
  entry: dec(4000),
  exit: dec('4010.5'),
  initialMargin: dec(5000),
  maintenanceMargin: dec(4000),
  balance: dec(12000),
};

describe('futuresTrade', () => {
  it('works out P/L, notional, leverage and the margin-call price', () => {
    const r = futuresTrade(base);
    if (!r.ok) throw new Error(r.error.message);
    const v = r.value;
    expect(v.pointValue.toString()).toBe('20');
    expect(v.ticks.toString()).toBe('42');
    expect(v.profitLoss.toString()).toBe('420');
    expect(v.notional.toString()).toBe('160000');
    expect(v.initialMarginTotal.toString()).toBe('10000');
    expect(v.leverage.toString()).toBe('16');
    // (12,000 − 8,000) ÷ (20 × 2) = 100 points below entry.
    expect(v.marginCallPrice?.toString()).toBe('3900');
    // 12,000 ÷ 40 = 300 points: the whole balance, more than the 10,000 margin.
    expect(v.balanceGonePrice?.toString()).toBe('3700');
    expect(v.equityAfter.toString()).toBe('12420');
  });

  it('mirrors for a sell, and a loss can exceed the balance', () => {
    const r = futuresTrade({ ...base, side: 'sell', exit: dec(4400) });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.profitLoss.toString()).toBe('-16000');
    expect(r.value.marginCallPrice?.toString()).toBe('4100');
    expect(r.value.balanceGonePrice?.toString()).toBe('4300');
    expect(r.value.equityAfter.isNegative()).toBe(true);
  });

  it('gives no price for a long when reaching it would need a price of zero or below', () => {
    // 100,000 ÷ 20 = 5,000 points below an entry of 100.
    const r = futuresTrade({ ...base, contracts: dec(1), entry: dec(100), exit: dec(101), balance: dec(100000) });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.marginCallPrice).toBeNull();
    expect(r.value.balanceGonePrice).toBeNull();
  });

  it.each([
    [{ contracts: dec('1.5') }, 'contracts'],
    [{ contracts: dec(0) }, 'contracts'],
    [{ tickSize: dec(0) }, 'tickSize'],
    [{ tickValue: dec(-1) }, 'tickValue'],
    [{ entry: dec(0) }, 'entry'],
    [{ exit: dec(0) }, 'exit'],
    [{ initialMargin: dec(0) }, 'initialMargin'],
    [{ maintenanceMargin: dec(6000) }, 'maintenanceMargin'],
    [{ exit: dec('4000.1') }, 'exit'],
    [{ balance: dec(9999) }, 'balance'],
  ])('refuses %o', (patch, field) => {
    const r = futuresTrade({ ...base, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.issues).toEqual([field]);
  });
});
