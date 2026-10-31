import { dec } from '../../../shared/decimal';
import {
  breakEvenWinRate,
  chanceOfLosingStreak,
  checkOrder,
  compound,
  cooldown,
  EXAMPLE_RISK_RULES,
  expectancyR,
  invalidRuleFields,
  recoveryNeeded,
  simulateRuin,
  sizePosition,
  type OrderContext,
  type SizingInput,
} from '..';

const EURUSD: SizingInput = {
  balance: dec(10000),
  riskPercent: dec(1),
  side: 'buy',
  entry: dec('1.1000'),
  stop: dec('1.0950'),
  target: dec('1.1100'),
  spec: { contractSize: dec(100000), pipSize: dec('0.0001'), lotStep: dec('0.01'), minLot: dec('0.01') },
  quoteToAccount: dec(1),
  costs: { spreadPips: dec(1), commissionPerLot: dec(7) },
};

describe('sizePosition', () => {
  it('keeps the loss at the stop, after costs, within the budget', () => {
    // 50 pips × $10/pip = $500 per lot, plus $10 spread and $7 commission = $517 per lot.
    // $100 ÷ $517 = 0.193… → rounded down to 0.19 lots.
    const r = sizePosition(EURUSD);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.moneyAtRisk.toString()).toBe('100');
    expect(r.value.stopDistancePips.toString()).toBe('50');
    expect(r.value.lots.toString()).toBe('0.19');
    expect(r.value.grossLossAtStop.toString()).toBe('95');
    expect(r.value.netLossAtStop.toString()).toBe('98.23');
    expect(r.value.netProfitAtTarget?.toString()).toBe('186.77');
    expect(r.value.rewardToRisk?.toString()).toBe('2');
    expect(r.value.netLossAtStop.lte(r.value.moneyAtRisk)).toBe(true);
    expect(r.value.assumptions.join(' ')).toMatch(/gap or slippage/);
  });

  it('works for sells and converts the quote currency', () => {
    const r = sizePosition({ ...EURUSD, side: 'sell', entry: dec('150.00'), stop: dec('150.50'), target: null, spec: { ...EURUSD.spec, pipSize: dec('0.01') }, quoteToAccount: dec('0.0066'), costs: { spreadPips: dec(0), commissionPerLot: dec(0) } });
    if (!r.ok) throw new Error(r.error.message);
    // 50 pips × 100000 × 0.01 × 0.0066 = $6.60 per pip per lot → $330 per lot; $100 ÷ 330 = 0.303 → 0.30.
    expect(r.value.lots.toString()).toBe('0.3');
    expect(r.value.netProfitAtTarget).toBeNull();
    expect(r.value.assumptions.join(' ')).toMatch(/worth 0.0066/);
  });

  it('reports a size below the minimum as zero rather than rounding up', () => {
    const r = sizePosition({ ...EURUSD, balance: dec(50) });
    expect(r.ok && r.value.belowMinimum).toBe(true);
    expect(r.ok && r.value.lots.toString()).toBe('0');
  });

  it('rejects impossible inputs instead of guessing', () => {
    expect(sizePosition({ ...EURUSD, stop: dec('1.1050') }).ok).toBe(false);
    expect(sizePosition({ ...EURUSD, target: dec('1.0900') }).ok).toBe(false);
    expect(sizePosition({ ...EURUSD, riskPercent: dec(0) }).ok).toBe(false);
    expect(sizePosition({ ...EURUSD, riskPercent: dec(101) }).ok).toBe(false);
    expect(sizePosition({ ...EURUSD, spec: { ...EURUSD.spec, pipSize: dec(0) } }).ok).toBe(false);
    expect(sizePosition({ ...EURUSD, costs: { spreadPips: dec(-1), commissionPerLot: dec(0) } }).ok).toBe(false);
  });
});

const CTX: OrderContext = {
  equity: dec(10000),
  plannedRisk: dec(100),
  openPositions: 0,
  marginAfter: dec(1000),
  dayStartBalance: dec(10000),
  dayRealised: dec(0),
  lastTrade: null,
};

describe('checkOrder', () => {
  it('passes an order inside every rule', () => {
    expect(checkOrder(EXAMPLE_RISK_RULES, CTX)).toEqual([]);
  });

  it('shows the rule, the numbers, and a lesson for each break', () => {
    const v = checkOrder(EXAMPLE_RISK_RULES, {
      ...CTX,
      plannedRisk: dec(250),
      openPositions: 3,
      marginAfter: dec(4000),
      dayRealised: dec(-300),
      lastTrade: { lost: true, plannedRisk: dec(100) },
    });
    expect(v.map((x) => x.rule)).toEqual(['risk_per_trade', 'size_up_after_loss', 'daily_loss', 'open_positions', 'margin_use']);
    expect(v[0]!.calculation).toBe('250.00 at the stop ÷ 10000.00 equity = 2.50%.');
    expect(v[2]!.calculation).toBe('Lost 300.00 today ÷ 10000.00 = 3.00%.');
    // Every rule links a lesson except the daily limit, which has no lesson yet.
    expect(v.filter((x) => x.lessonId === null).map((x) => x.rule)).toEqual(['daily_loss']);
  });

  it('treats any risk as over the limit when equity is zero or below', () => {
    const v = checkOrder(EXAMPLE_RISK_RULES, { ...CTX, equity: dec(0), plannedRisk: dec(5), marginAfter: dec(10) });
    expect(v.map((x) => x.rule)).toEqual(expect.arrayContaining(['risk_per_trade', 'margin_use']));
    expect(v[0]!.calculation).toBe('5.00 at the stop ÷ 0.00 equity = more than 100%.');
  });

  it('flags a missing stop only when the learner requires one', () => {
    expect(checkOrder(EXAMPLE_RISK_RULES, { ...CTX, plannedRisk: null }).map((x) => x.rule)).toEqual(['no_stop']);
    expect(checkOrder({ ...EXAMPLE_RISK_RULES, requireStop: false }, { ...CTX, plannedRisk: null })).toEqual([]);
  });

  it('does not flag a smaller or equal size after a loss', () => {
    expect(checkOrder(EXAMPLE_RISK_RULES, { ...CTX, lastTrade: { lost: true, plannedRisk: dec(100) } })).toEqual([]);
  });
});

describe('cooldown', () => {
  it('prompts after the daily limit or a losing streak, and never suggests a bigger size', () => {
    expect(cooldown(EXAMPLE_RISK_RULES, 0, dec(10000), dec(-300))?.reason).toBe('daily_loss');
    const streak = cooldown(EXAMPLE_RISK_RULES, 3, dec(10000), dec(-100));
    expect(streak?.reason).toBe('losing_streak');
    expect(streak?.message).toMatch(/bigger size will not undo/);
    expect(cooldown(EXAMPLE_RISK_RULES, 2, dec(10000), dec(50))).toBeNull();
  });
});

describe('invalidRuleFields', () => {
  it('lists fields out of range or not whole numbers', () => {
    expect(invalidRuleFields(EXAMPLE_RISK_RULES)).toEqual([]);
    expect(invalidRuleFields({ ...EXAMPLE_RISK_RULES, maxRiskPerTradePercent: 50, maxOpenPositions: 2.5, reviewAfterLosses: Number.NaN })).toEqual([
      'maxRiskPerTradePercent',
      'maxOpenPositions',
      'reviewAfterLosses',
    ]);
  });
});

describe('risk education calculators', () => {
  it('computes break-even win rate, expectancy, recovery and compounding', () => {
    expect(breakEvenWinRate(dec(2))?.toFixed(4)).toBe('0.3333');
    expect(breakEvenWinRate(dec(0))).toBeNull();
    expect(expectancyR(dec('0.5'), dec(2), dec(1)).toString()).toBe('0.5');
    expect(recoveryNeeded(dec('0.5'))?.toString()).toBe('1');
    expect(recoveryNeeded(dec('0.2'))?.toString()).toBe('0.25');
    expect(recoveryNeeded(dec(1))).toBeNull();
    expect(compound(dec(1000), dec('0.1'), 2).toString()).toBe('1210');
  });

  it('computes the exact chance of a losing streak', () => {
    expect(chanceOfLosingStreak(0.5, 2, 2)).toBeCloseTo(0.25);
    // LLW, LLL, WLL out of 8 sequences.
    expect(chanceOfLosingStreak(0.5, 3, 2)).toBeCloseTo(0.375);
    expect(chanceOfLosingStreak(0.5, 1, 2)).toBe(0);
    expect(chanceOfLosingStreak(0, 10, 2)).toBe(0);
    expect(chanceOfLosingStreak(1, 5, 5)).toBeCloseTo(1);
  });

  it('simulates ruin deterministically, and more risk means more ruin', () => {
    const base = { winRate: 0.4, rewardToRisk: 1.5, ruinDrawdown: 0.5, trades: 200, runs: 500, seed: 7 };
    const small = simulateRuin({ ...base, riskFraction: 0.01 });
    const large = simulateRuin({ ...base, riskFraction: 0.1 });
    expect(simulateRuin({ ...base, riskFraction: 0.01 })).toBe(small);
    expect(large).toBeGreaterThan(small);
  });
});
