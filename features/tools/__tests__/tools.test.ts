import type { GlossaryEntry } from '../../../domain/models/content';
import { calculator, CALCULATORS, defaultValues, describeInputError, visibleFields } from '../calculators';
import { glossaryTermView, searchGlossary } from '../glossary';

const entry = (id: string, term: string, simple: string, extra: Partial<GlossaryEntry> = {}): GlossaryEntry => ({
  id,
  term,
  aliases: [],
  definition: { simple },
  related: [],
  markets: ['forex'],
  level: 'beginner',
  sourceIds: [],
  ...extra,
});

describe('calculator definitions', () => {
  it('every calculator computes a result from its own example values', () => {
    for (const def of CALCULATORS) {
      expect(def.compute(defaultValues(def)).ok).toBe(true);
    }
  });

  it('pip value: example values give 1 USD per pip on 0.10 lot EUR/USD', () => {
    const def = calculator('pip_value')!;
    const r = def.compute(defaultValues(def));
    expect(r.ok && r.value.find((l) => l.label === 'One pip in your account currency')?.value).toBe('1.00 USD');
  });

  it('asks for a conversion rate only when the account currency is on neither side', () => {
    const def = calculator('pip_value')!;
    const names = (pair: string, acc: string) => visibleFields(def, { ...defaultValues(def), pair, accountCurrency: acc }).map((f) => f.name);
    expect(names('EUR/USD', 'USD')).not.toContain('quoteToAccountRate');
    expect(names('USD/JPY', 'usd')).not.toContain('quoteToAccountRate');
    expect(names('EUR/GBP', 'USD')).toContain('quoteToAccountRate');
    const r = def.compute({ ...defaultValues(def), pair: 'EUR/GBP', price: '0.85', quoteToAccountRate: '1.25' });
    expect(r.ok && r.value.at(-1)?.value).toBe('1.25 USD');
  });

  it('position size warns when even the smallest lot is too much', () => {
    const r = calculator('position_size')!.compute({ balance: '50', riskPercent: '1', stopPips: '50', pipValuePerLot: '10' });
    expect(r.ok && r.value.some((l) => l.label === 'Note')).toBe(true);
  });

  it('margin status, P/L, and risk:reward format their answers', () => {
    const status = calculator('margin_status')!.compute({ equity: '1000', usedMargin: '0' });
    expect(status.ok && status.value[1]?.value).toBe('No open positions');
    const pl = calculator('profit_loss')!.compute({ ...defaultValues(calculator('profit_loss')!), side: 'sell' });
    expect(pl.ok && pl.value[1]?.value).toBe('-20.00 USD');
    const rr = calculator('risk_reward')!.compute(defaultValues(calculator('risk_reward')!));
    expect(rr.ok && rr.value[2]?.value).toBe('1 : 2.00');
    const margin = calculator('margin')!.compute(defaultValues(calculator('margin')!));
    expect(margin.ok && margin.value[1]?.value).toBe('366.67 USD');
    expect(calculator('nope')).toBeNull();
  });

  it('names the form field in error messages', () => {
    const def = calculator('margin')!;
    const r = def.compute({ ...defaultValues(def), leverage: '0' });
    expect(!r.ok && describeInputError(def, r.error)).toBe('Leverage (the 30 in 1:30) must be more than zero');
    const cross = def.compute({ ...defaultValues(def), pair: 'EUR/GBP' });
    expect(!cross.ok && describeInputError(def, cross.error)).toMatch(/one EUR is worth/);
  });
});

describe('glossary', () => {
  const entries = [entry('pip', 'Pip', 'A small price step.', { aliases: ['pips'] }), entry('spread', 'Spread', 'Gap between bid and ask.')];

  it('searches term, aliases, and definition, ignoring case', () => {
    expect(searchGlossary(entries, '').map((e) => e.id)).toEqual(['pip', 'spread']);
    expect(searchGlossary(entries, 'PIPS').map((e) => e.id)).toEqual(['pip']);
    expect(searchGlossary(entries, 'bid').map((e) => e.id)).toEqual(['spread']);
    expect(searchGlossary(entries, 'zzz')).toEqual([]);
  });

  it('shows the definition at the learner level, with the simple one as a summary', () => {
    const e = entry('pip', 'Pip', 'Simple.', { definition: { simple: 'Simple.', advanced: 'Advanced.' }, example: 'Ex' });
    expect(glossaryTermView(e, [], 'advanced')).toMatchObject({ definition: 'Advanced.', simpleDefinition: 'Simple.', example: 'Ex' });
    expect(glossaryTermView(e, [entries[1]!], 'simple')).toMatchObject({ definition: 'Simple.', simpleDefinition: null, related: [{ id: 'spread', term: 'Spread' }] });
  });
});
