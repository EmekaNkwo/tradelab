import { render, screen } from '@testing-library/react-native';
import { CALCULATORS, defaultValues, type CalculatorField } from '../../features/tools';
import { darkTheme, lightTheme, ThemeProvider, type Theme } from '../../theme';
import { CalculatorResult } from '../tools/CalculatorResult';
import { fieldUnit, HEADLINE, isProse, resultView, signedHeadline } from '../tools/calculatorView';
import { fieldHint, TextField } from '../ui/TextField';

/** Calculators restyle (brief §5.7): the hero line, the split of the other lines, units and the large field. */
const field = (over: Partial<CalculatorField>): CalculatorField => ({ name: 'x', label: 'X', kind: 'number', defaultValue: '', ...over });

describe('resultView', () => {
  it.each(CALCULATORS.map((c) => [c.id, c] as const))('%s leads with its headline and keeps every line exactly once', (_id, def) => {
    const r = def.compute(defaultValues(def));
    if (!r.ok) throw new Error('example values should compute');
    const v = resultView(def.id, r.value);
    expect(v.main?.label).toBe(HEADLINE[def.id]);
    expect([v.main, ...v.details, ...v.notes]).toHaveLength(r.value.length);
    expect(new Set([v.main, ...v.details, ...v.notes])).toEqual(new Set(r.value));
    expect(v.details.every((l) => !isProse(l.value)) && v.notes.every((l) => isProse(l.value))).toBe(true);
  });

  it('falls back to the first figure, then the first line, then nothing', () => {
    const note = { label: 'Note', value: 'A sentence of four words' };
    expect(resultView('pip_value', [note, { label: 'Other', value: '2.00' }]).main?.label).toBe('Other');
    expect(resultView('pip_value', [note]).main).toBe(note);
    expect(resultView('pip_value', [])).toEqual({ main: null, details: [], notes: [] });
  });
});

describe('fieldUnit', () => {
  it('takes the unit from the label’s brackets, or the account currency for amounts', () => {
    expect(fieldUnit(field({ label: 'Size (lots)' }), {})).toBe('lots');
    expect(fieldUnit(field({ label: 'Win rate (%)' }), {})).toBe('%');
    expect(fieldUnit(field({ label: 'Risk per trade (% of equity)' }), {})).toBe('%');
    expect(fieldUnit(field({ label: 'Spread (pips)' }), {})).toBe('pips');
    expect(fieldUnit(field({ label: 'Average win (R)' }), {})).toBe('R');
    expect(fieldUnit(field({ label: 'Leverage (the 30 in 1:30)' }), {})).toBeNull();
    expect(fieldUnit(field({ name: 'balance', label: 'Account balance' }), { accountCurrency: ' usd ' })).toBe('USD');
    expect(fieldUnit(field({ name: 'equity', label: 'Equity', kind: 'signed' }), { accountCurrency: 'US' })).toBeNull();
    expect(fieldUnit(field({ name: 'balance', label: 'Account balance' }), {})).toBeNull();
    expect(fieldUnit(field({ name: 'pair', label: 'Currency pair (x)', kind: 'pair' }), {})).toBeNull();
  });
});

describe('TextField suffix and size', () => {
  it('shows the unit inside the field, says it in the hint, and is taller when large', async () => {
    expect(fieldHint(undefined, null)).toBeUndefined();
    expect(fieldHint('Help', undefined)).toBe('Help');
    expect(fieldHint(undefined, 'lots')).toBe('Unit: lots.');
    expect(fieldHint('Help', '%')).toBe('Help. Unit: %.');
    await render(
      <ThemeProvider preference="light">
        <TextField label="Size (lots)" value="1" onChangeText={() => undefined} testID="big" suffix="lots" size="large" />
        <TextField label="Plain" value="" onChangeText={() => undefined} testID="plain" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('big').props.accessibilityHint).toBe('Unit: lots.');
    expect(screen.getByText('lots', { includeHiddenElements: true })).toBeTruthy();
    const flat = (id: string) => [screen.getByTestId(id).props.style].flat(3).reduce((a, b) => ({ ...a, ...(b ?? {}) }), {} as Record<string, unknown>);
    expect(flat('big')).toMatchObject({ minHeight: 56, fontSize: 17 });
    expect(flat('plain')).toMatchObject({ minHeight: 44, fontSize: 15 });
  });

  it.each<[string, Theme]>([
    ['light', lightTheme],
    ['dark', darkTheme],
  ])('field text and its unit meet AA on the field fill (%s)', (_n, { colors }) => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    expect(ratio(colors.textPrimary, colors.surfaceMuted)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colors.textSecondary, colors.surfaceMuted)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('CalculatorResult', () => {
  it('shows a sentence answer as words, and leaves out an empty details card', async () => {
    const size = { label: 'Size', value: '0 lots: below the smallest size. Skip it.' };
    await render(
      <ThemeProvider preference="light">
        <CalculatorResult id="pip_value" view={{ main: size, details: [], notes: [] }} formula="Lots = risk ÷ stop" />
      </ThemeProvider>,
    );
    expect(screen.getByText(size.value)).toBeTruthy();
    expect(screen.queryByText('Details')).toBeNull();
    expect(screen.getByText('Lots = risk ÷ stop')).toBeTruthy();
  });

  it('renders just the formula when there is no line', async () => {
    await render(
      <ThemeProvider preference="light">
        <CalculatorResult id="pip_value" view={{ main: null, details: [], notes: [] }} formula="F" />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('calculator-result')).toBeNull();
    expect(screen.getByText('F')).toBeTruthy();
  });
});

describe('signedHeadline', () => {
  const line = (value: string) => ({ label: 'Result', value });
  it('gives a profit or loss figure its sign and spoken direction', () => {
    expect(signedHeadline('profit_loss', line('20.00 USD'))).toEqual({ direction: 'up', text: '+20.00 USD', spoken: expect.stringMatching(/^Result, gain of 20\.00 USD/) });
    expect(signedHeadline('profit_loss', line('-1,250.50 USD'))).toMatchObject({ direction: 'down', text: '\u22121,250.50 USD', spoken: expect.stringMatching(/loss of 1,250\.50 USD/) });
    expect(signedHeadline('futures_contract', line('\u22125.00 USD'))?.direction).toBe('down');
    // Zero at the shown decimals is flat, whatever its sign.
    expect(signedHeadline('profit_loss', line('-0.00 USD'))).toMatchObject({ direction: 'flat', spoken: expect.stringMatching(/no gain or loss/) });
  });

  it('leaves other calculators and non-figures alone', () => {
    expect(signedHeadline('pip_value', line('1.00 USD'))).toBeNull();
    expect(signedHeadline('profit_loss', line('Enter a price'))).toBeNull();
  });

  it('draws an arrow with the signed figure on the hero, in hero ink', async () => {
    await render(
      <ThemeProvider preference="light">
        <CalculatorResult id="profit_loss" view={{ main: line('-3.00 USD'), details: [], notes: [] }} formula="F" />
      </ThemeProvider>,
    );
    const figure = screen.getByTestId('calculator-signed');
    expect(figure).toHaveTextContent('\u22123.00 USD');
    expect(figure.props.accessibilityLabel).toMatch(/^Result, loss of 3\.00 USD.*calculation only$/);
    const pill = screen.getByTestId('calculation-pill');
    expect(pill).toHaveStyle({ alignSelf: 'flex-start', maxWidth: '100%' });
  });
});
