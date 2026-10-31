import { pressScale, PRESS_SCALE } from '../pressFeedback';
import { clampPercent, directionOf, MINUS, signedText, signFor, splitDecimal, spokenChange, spokenDirection, unsigned } from '../valueParts';
import { instrumentGlyph, isFlagCurrency, stripBrokerSuffix } from '../instrumentGlyph';

describe('splitDecimal', () => {
  it.each([
    ['$10,430.25', { integer: '$10,430', decimals: '.25', suffix: '' }],
    ['4.3%', { integer: '4', decimals: '.3', suffix: '%' }],
    ['+1.7R', { integer: '+1', decimals: '.7', suffix: 'R' }],
    ['1,200', { integer: '1,200', decimals: '', suffix: '' }],
    ['—', { integer: '—', decimals: '', suffix: '' }],
    // Inputs are en-formatted: a single dot is the decimal point.
    ['1.234', { integer: '1', decimals: '.234', suffix: '' }],
    // More than one dot is not en-formatted: left whole rather than split in the wrong place.
    ['1.234.567', { integer: '1.234.567', decimals: '', suffix: '' }],
  ])('%s', (value, parts) => expect(splitDecimal(value)).toEqual(parts));
});

describe('signs and directions', () => {
  it('gives a direction for any number, zero and NaN flat', () => {
    expect(directionOf(3)).toBe('up');
    expect(directionOf(-0.1)).toBe('down');
    expect(directionOf(0)).toBe('flat');
    expect(directionOf(Number.NaN)).toBe('flat');
  });

  it('is flat when the shown (rounded) value is zero, so "−0.0%" never appears', () => {
    expect(directionOf(-0.04, 1)).toBe('flat');
    expect(directionOf(0.04, 1)).toBe('flat');
    expect(directionOf(-0.05, 1)).toBe('down');
    expect(directionOf(-0.004, 2)).toBe('flat');
    expect(directionOf(-0.04)).toBe('down');
    expect(unsigned(`${MINUS}1.7R`)).toBe('1.7R');
  });

  it('always shows a sign, with a true minus', () => {
    expect(signFor('up')).toBe('+');
    expect(signFor('down')).toBe(MINUS);
    expect(signFor('flat')).toBe('±');
    expect(signedText('down', '$12.40')).toBe(`${MINUS}$12.40`);
    expect(signedText('up', '-4%')).toBe('+4%');
    expect(signedText('flat', '0%')).toBe('±0%');
  });

  it('spells direction out for screen readers, without symbols', () => {
    expect(spokenChange('Quiz accuracy', 'up', '+4.3%')).toBe('Quiz accuracy, up 4.3%');
    expect(spokenChange(undefined, 'down', `${MINUS}2`)).toBe('down 2');
    expect(spokenChange('Equity', 'up', '$42.50', 'result')).toBe('Equity, gain of $42.50');
    expect(spokenChange(undefined, 'down', '$18', 'result')).toBe('loss of $18');
    expect(spokenDirection('flat', 'result')).toBe('no gain or loss,');
    expect(spokenDirection('flat', 'change')).toBe('no change,');
  });

  it('clamps percentages', () => {
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
  });
});

describe('press feedback', () => {
  it('scales to 0.98 while pressed, and not at all with reduce motion on', () => {
    expect(pressScale(true, false)).toBe(PRESS_SCALE);
    expect(pressScale(true, true)).toBe(1);
    expect(pressScale(false, false)).toBe(1);
  });
});

describe('instrument glyphs', () => {
  it('reads forex pairs with or without a slash', () => {
    expect(instrumentGlyph('EUR/USD')).toEqual({ kind: 'pair', base: 'EUR', quote: 'USD' });
    expect(instrumentGlyph('gbpjpy')).toEqual({ kind: 'pair', base: 'GBP', quote: 'JPY' });
  });

  it('gives commodities and indices a glyph, and anything else a letter', () => {
    expect(instrumentGlyph('XAUUSD').kind).toBe('gold');
    expect(instrumentGlyph('XAG/USD').kind).toBe('silver');
    expect(instrumentGlyph('USOIL').kind).toBe('oil');
    expect(instrumentGlyph('XTIUSD').kind).toBe('oil');
    expect(instrumentGlyph('US500').kind).toBe('index');
    expect(instrumentGlyph('NAS100').kind).toBe('index');
    expect(instrumentGlyph('AAPL')).toEqual({ kind: 'letter', letter: 'A' });
    expect(instrumentGlyph('  ')).toEqual({ kind: 'letter', letter: '?' });
  });

  it('does not mistake stock tickers for oil or for pairs', () => {
    expect(instrumentGlyph('CL')).toEqual({ kind: 'letter', letter: 'C' });
    expect(instrumentGlyph('OIL')).toEqual({ kind: 'letter', letter: 'O' });
    expect(instrumentGlyph('ABCDEF')).toEqual({ kind: 'letter', letter: 'A' });
    expect(instrumentGlyph('GOOGLE')).toEqual({ kind: 'letter', letter: 'G' });
    expect(instrumentGlyph('XAUZZZ')).toEqual({ kind: 'letter', letter: 'X' });
    expect(instrumentGlyph('USD/NGN')).toEqual({ kind: 'pair', base: 'USD', quote: 'NGN' });
  });

  it('strips broker suffixes', () => {
    expect(stripBrokerSuffix('EURUSD.r')).toBe('EURUSD');
    expect(stripBrokerSuffix('EURUSD.pro')).toBe('EURUSD');
    expect(stripBrokerSuffix('EURUSDm')).toBe('EURUSD');
    expect(stripBrokerSuffix('EURUSD-ECN')).toBe('EURUSD');
    expect(stripBrokerSuffix('eurusd')).toBe('eurusd');
    // Mixed case keeps its letters (and still reads as a pair); only known bare tails are removed.
    expect(stripBrokerSuffix('Eurusd')).toBe('Eurusd');
    expect(instrumentGlyph('Eurusd')).toEqual({ kind: 'pair', base: 'EUR', quote: 'USD' });
    expect(stripBrokerSuffix('EURUSDq')).toBe('EURUSDq');
    expect(stripBrokerSuffix('XOM')).toBe('XOM');
    expect(instrumentGlyph('GBPJPY.r')).toEqual({ kind: 'pair', base: 'GBP', quote: 'JPY' });
    expect(instrumentGlyph('XAUUSDm').kind).toBe('gold');
  });

  it('knows which currencies have a drawn flag', () => {
    expect(isFlagCurrency('EUR')).toBe(true);
    expect(isFlagCurrency('NGN')).toBe(false);
  });
});
