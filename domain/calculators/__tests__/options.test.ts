import { dec } from '../../../shared/decimal';
import { optionAtExpiry, type OptionInput } from '../options';

// Fictional contract: 1 contract covers 100 units; strike 50, premium 2 per unit.
const base: OptionInput = {
  kind: 'call',
  side: 'buy',
  contracts: dec(1),
  multiplier: dec(100),
  strike: dec(50),
  premium: dec(2),
  expiryPrice: dec(56),
};

const run = (patch: Partial<OptionInput>) => {
  const r = optionAtExpiry({ ...base, ...patch });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('optionAtExpiry', () => {
  it('bought call in the money: intrinsic value minus the premium', () => {
    const v = run({});
    expect(v.moneyness).toBe('in');
    expect(v.intrinsicPerUnit.toString()).toBe('6');
    expect(v.premiumTotal.toString()).toBe('200');
    expect(v.profitLoss.toString()).toBe('400');
    expect(v.breakEven?.toString()).toBe('52');
    expect(v.maxLoss).toEqual({ kind: 'amount', amount: dec(200) });
    expect(v.maxGain).toEqual({ kind: 'unlimited' });
  });

  it('bought call out of the money expires worthless and loses the whole premium', () => {
    const v = run({ expiryPrice: dec(45) });
    expect(v.moneyness).toBe('out');
    expect(v.intrinsicPerUnit.toString()).toBe('0');
    expect(v.profitLoss.toString()).toBe('-200');
  });

  it('at the strike is at the money', () => {
    expect(run({ expiryPrice: dec(50) }).moneyness).toBe('at');
  });

  it('sold call: keeps the premium at most, and has no fixed limit on the loss', () => {
    const v = run({ side: 'sell', expiryPrice: dec(60), contracts: dec(2) });
    expect(v.premiumTotal.toString()).toBe('400');
    expect(v.profitLoss.toString()).toBe('-1600');
    expect(v.maxGain).toEqual({ kind: 'amount', amount: dec(400) });
    expect(v.maxLoss).toEqual({ kind: 'unlimited' });
  });

  it('bought put gains when the price falls; its biggest gain is when the price reaches zero', () => {
    const v = run({ kind: 'put', expiryPrice: dec(44) });
    expect(v.moneyness).toBe('in');
    expect(v.intrinsicPerUnit.toString()).toBe('6');
    expect(v.profitLoss.toString()).toBe('400');
    expect(v.breakEven?.toString()).toBe('48');
    expect(v.maxGain).toEqual({ kind: 'amount', amount: dec(4800) });
    expect(v.maxLoss).toEqual({ kind: 'amount', amount: dec(200) });
  });

  it('sold put: the loss is largest if the price falls to zero', () => {
    const v = run({ kind: 'put', side: 'sell', expiryPrice: dec(40) });
    expect(v.profitLoss.toString()).toBe('-800');
    expect(v.maxLoss).toEqual({ kind: 'amount', amount: dec(4800) });
    expect(v.maxGain).toEqual({ kind: 'amount', amount: dec(200) });
  });

  it('a put whose premium is at least the strike has no breakeven above zero', () => {
    expect(run({ kind: 'put', premium: dec(50), expiryPrice: dec(0) }).breakEven).toBeNull();
  });

  it('rejects impossible inputs and names the field', () => {
    const cases: [Partial<OptionInput>, string][] = [
      [{ contracts: dec('1.5') }, 'contracts'],
      [{ contracts: dec(0) }, 'contracts'],
      [{ multiplier: dec(0) }, 'multiplier'],
      [{ strike: dec(0) }, 'strike'],
      [{ premium: dec(-1) }, 'premium'],
      [{ expiryPrice: dec(-1) }, 'expiryPrice'],
    ];
    for (const [patch, field] of cases) {
      const r = optionAtExpiry({ ...base, ...patch });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.issues).toEqual([field]);
    }
  });
});
