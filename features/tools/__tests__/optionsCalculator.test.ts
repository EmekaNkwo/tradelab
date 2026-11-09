import { calculator, defaultValues } from '../calculators';
import { OPTIONS_CALCULATOR } from '../optionsCalculator';

const lines = (patch: Record<string, string> = {}) => {
  const r = OPTIONS_CALCULATOR.compute({ ...defaultValues(OPTIONS_CALCULATOR), ...patch });
  if (!r.ok) throw new Error(r.error.message);
  return Object.fromEntries(r.value.map((l) => [l.label, l.value]));
};

describe('option at expiry calculator', () => {
  it('is listed and starts on a fictional bought call', () => {
    expect(calculator('option_payoff')).toBe(OPTIONS_CALCULATOR);
    const l = lines();
    expect(l['Profit or loss at expiry']).toBe('400.00');
    expect(l['Premium paid']).toBe('200.00');
    expect(l['Breakeven price at expiry']).toBe('52.00');
    expect(l['Largest possible loss']).toBe('200.00');
    expect(l['Largest possible gain']).toMatch(/No fixed limit/);
    expect(l['Only the value at expiry']).toMatch(/does not estimate/);
  });

  it('warns about the uncovered sold call', () => {
    const l = lines({ side: 'sell' });
    expect(l['Premium received']).toBe('200.00');
    expect(l['Largest possible loss']).toMatch(/No fixed limit/);
    expect(l['Selling a call you do not cover']).toBeDefined();
  });

  it('a put that expires out of the money loses the premium', () => {
    expect(lines({ kind: 'put' })['At expiry']).toBe('Expires worthless');
    expect(lines({ kind: 'put' })['Profit or loss at expiry']).toBe('-200.00');
  });

  it('reports bad input by field', () => {
    const r = OPTIONS_CALCULATOR.compute({ ...defaultValues(OPTIONS_CALCULATOR), strike: '0' });
    expect(r.ok).toBe(false);
  });
});
