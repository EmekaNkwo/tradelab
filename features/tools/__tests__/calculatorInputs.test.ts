/**
 * Calculators with missing or bad input must refuse, never show a made-up
 * answer, and must name the form field the learner has to fix.
 */
import { resetFeatureFlags, turnFeaturesOff } from '../../../testing/featureFlagSeam';
import { availableCalculators, calculator, CALCULATORS, defaultValues, describeInputError, visibleFields } from '../calculators';

jest.mock('../../../shared/featureFlags', () =>
  jest.requireActual<typeof import('../../../testing/featureFlagSeam')>('../../../testing/featureFlagSeam').createFeatureFlagsModule(),
);

afterEach(() => resetFeatureFlags());

describe('calculator inputs', () => {
  it.each(CALCULATORS.map((c) => [c.id, c] as const))('%s refuses an empty form', (_id, def) => {
    const r = def.compute({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(describeInputError(def, r.error).length).toBeGreaterThan(0);
  });

  it.each(CALCULATORS.map((c) => [c.id, c] as const))('%s refuses text where a number belongs', (_id, def) => {
    const numberField = def.fields.find((f) => f.kind === 'number' && f.defaultValue !== '');
    if (!numberField) return;
    const r = def.compute({ ...defaultValues(def), [numberField.name]: 'abc' });
    expect(r.ok).toBe(false);
  });

  it('a cross pair without a conversion rate is refused, and no rate field shows for a blank form', () => {
    const def = calculator('profit_loss')!;
    const r = def.compute({ ...defaultValues(def), pair: 'EUR/GBP', accountCurrency: 'USD' });
    expect(r.ok).toBe(false);
    // No pair and no account currency: both sides compare equal (blank), so no rate is asked for yet.
    expect(visibleFields(def, {}).map((f) => f.name)).not.toContain('quoteToAccountRate');
  });

  it('keeps the domain message when it names no form field', () => {
    const def = calculator('risk_reward')!;
    expect(describeInputError(def, { kind: 'ValidationError', message: 'Something else is wrong' } as never)).toBe('Something else is wrong');
  });

  it('a buy and a sell read the same risk and reward the right way round', () => {
    const def = calculator('risk_reward')!;
    const sell = def.compute({ side: 'sell', entry: '1.10000', stop: '1.10200', target: '1.09600' });
    expect(sell.ok && sell.value[2]?.value).toBe('1 : 2.00');
    const wrongWay = def.compute({ side: 'sell', entry: '1.10000', stop: '1.09800', target: '1.10400' });
    expect(wrongWay.ok).toBe(false);
  });

  it('position size gives no warning when the smallest lot fits the limit', () => {
    const r = calculator('position_size')!.compute(defaultValues(calculator('position_size')!));
    expect(r.ok && r.value.some((l) => l.label === 'Note')).toBe(false);
  });

  it('margin level is shown as a percentage when margin is in use', () => {
    const r = calculator('margin_status')!.compute({ equity: '1000', usedMargin: '250' });
    expect(r.ok && r.value[1]?.value).toBe('400.0%');
  });

  it('hides the futures contract calculator when its feature is off', () => {
    expect(availableCalculators().some((c) => c.id === 'futures_contract')).toBe(true);
    turnFeaturesOff('futuresCalculator');
    expect(availableCalculators().some((c) => c.id === 'futures_contract')).toBe(false);
    expect(calculator('futures_contract')).toBeNull();
  });
});
