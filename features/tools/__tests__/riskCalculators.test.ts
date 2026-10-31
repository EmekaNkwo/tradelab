import { calculator, defaultValues } from '../calculators';
import { RISK_CALCULATORS } from '../riskCalculators';

const run = (id: string, patch: Record<string, string> = {}) => {
  const def = calculator(id);
  if (!def) throw new Error(`no calculator ${id}`);
  return def.compute({ ...defaultValues(def), ...patch });
};
const line = (id: string, label: string, patch: Record<string, string> = {}) => {
  const r = run(id, patch);
  if (!r.ok) throw new Error(r.error.message);
  return r.value.find((l) => l.label === label)?.value;
};

describe('risk calculators', () => {
  it('are all registered and work on their example values', () => {
    for (const def of RISK_CALCULATORS) expect(run(def.id).ok).toBe(true);
  });

  it('sizes a position with costs and lists its assumptions', () => {
    // 1% of 10,000 = 100 at risk; 50 pips × 10 per pip per lot = 500 + 1 pip spread (10) + 7 commission = 517 per lot → 0.19 lots.
    expect(line('sizing_with_costs', 'Money at risk')).toBe('100.00');
    expect(line('sizing_with_costs', 'Size')).toBe('0.19 lots');
    expect(line('sizing_with_costs', 'Assumption 1')).toBeTruthy();
    expect(line('sizing_with_costs', 'Profit at target, after costs', { target: '0' })).toBeUndefined();
    expect(line('sizing_with_costs', 'Size', { riskPercent: '0.01' })).toMatch(/^0 lots: below the smallest size/);
  });

  it('computes break-even, expectancy, recovery, streaks, ruin, and compounding', () => {
    expect(line('break_even', 'Win rate needed to break even')).toBe('33.3%');
    expect(line('expectancy', 'Expectancy per trade')).toBe('0.20 R');
    expect(line('recovery', 'Gain needed to get back')).toBe('25.0%');
    expect(line('losing_streak', 'Chance of at least one such streak', { lossRate: '100', trades: '5', streak: '5' })).toBe('100.0%');
    expect(line('risk_of_ruin', 'Simulated runs that hit the ruin level', { winRate: '0' })).toBe('100.0%');
    expect(line('compounding', 'Ending amount', { start: '100', rate: '10', periods: '2' })).toBe('121.00');
    expect(line('compounding', 'Ending amount', { start: '100', rate: '-10', periods: '1' })).toBe('90.00');
  });

  it('rejects bad input with the field named', () => {
    expect(run('break_even', { rr: '0' })).toMatchObject({ ok: false, error: { issues: ['rr'] } });
    expect(run('break_even', { rr: '0x10' })).toMatchObject({ ok: false, error: { message: 'Reward : risk must be a number' } });
    expect(run('expectancy', { winRate: '101' })).toMatchObject({ ok: false, error: { message: 'Win rate must be at most 100' } });
    expect(run('recovery', { drawdown: '100' }).ok).toBe(false);
    expect(run('losing_streak', { trades: '2.5' })).toMatchObject({ ok: false, error: { message: 'Number of trades must be a whole number' } });
    expect(run('risk_of_ruin', { risk: '0' })).toMatchObject({ ok: false, error: { message: 'Risk per trade must be at least 0.01' } });
    expect(run('compounding', { start: '-5' })).toMatchObject({ ok: false, error: { message: 'Starting amount cannot be negative' } });
    expect(run('sizing_with_costs', { stop: '1.1' }).ok).toBe(false);
  });
});
