import { dec } from '../../../shared/decimal';
import { errorText, notFound, validationError } from '../../../shared/errors';
import { checklistPrefill } from '../../paper';
import { EMPTY_PLAN } from '../../../domain/plan';
import { formToPlan, planToForm } from '../planForm';

describe('plan form', () => {
  it('splits instruments on commas and new lines, and reads typed numbers only', () => {
    const plan = formToPlan({ ...planToForm(EMPTY_PLAN), instruments: 'EURUSD,\n gbpusd , ,', riskPerTradePercent: '0,5', dailyLossPercent: '0x2', maxTradesPerDay: '1e1' });
    expect(plan.instruments).toEqual(['EURUSD', 'gbpusd']);
    expect(plan.riskPerTradePercent).toBe(0.5);
    expect(plan.dailyLossPercent).toBeNaN();
    expect(plan.maxTradesPerDay).toBeNaN();
  });

  it('round-trips a plan through the form', () => {
    const plan = { ...EMPTY_PLAN, instruments: ['EURUSD', 'GBPUSD'], sessions: ['london'] as const, timeframes: ['H1'] as const };
    expect(formToPlan(planToForm(plan))).toEqual(plan);
  });
});

describe('checklist prefill from the order check', () => {
  const base = { request: {} as never, marginNeeded: dec(100), violations: [] };
  it('answers the stop and risk questions from the order', () => {
    expect(checklistPrefill({ ...base, plannedRisk: dec(50) })).toEqual({ stop_set: 'yes', risk_within: 'yes' });
    expect(checklistPrefill({ ...base, plannedRisk: null })).toEqual({ stop_set: 'no', risk_within: 'no' });
    const over = { rule: 'risk_per_trade' as const, ruleText: '', calculation: '', lessonId: null };
    expect(checklistPrefill({ ...base, plannedRisk: dec(500), violations: [over] })).toEqual({ stop_set: 'yes', risk_within: 'no' });
  });
});

describe('error text for the learner', () => {
  it('shows validation messages and describes other errors by kind', () => {
    expect(errorText(validationError('Add at least one instrument'))).toBe('Add at least one instrument');
    expect(errorText({ kind: 'StorageError', message: 'SQLITE_FULL: disk' })).not.toMatch(/SQLITE/);
    expect(errorText(notFound('x'))).not.toBe('x');
  });
});
