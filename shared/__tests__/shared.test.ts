import { dec, isDecimalString, roundTo, sum, toFixedString } from '../decimal';
import { describeError, fromUnknown, validationError } from '../errors';
import { fnv1a } from '../hash';
import { createId, hasIdPrefix } from '../ids';
import { andThen, combine, err, mapResult, ok } from '../result';
import { fixedClock, isUtcIso, deviceTimeZone,
  isValidTimeZone, toUtcIso } from '../time';

describe('decimal', () => {
  it('adds money without binary floating-point error', () => {
    expect(dec('0.1').plus('0.2').toString()).toBe('0.3');
    expect(sum(['1.10', '2.20', '3.30']).toString()).toBe('6.6');
  });

  it('rounds half-even by default and supports explicit modes', () => {
    expect(roundTo('1.00005', 4).toString()).toBe('1');
    expect(roundTo('1.00015', 4).toString()).toBe('1.0002');
    expect(roundTo('1.00005', 4, 'half-up').toString()).toBe('1.0001');
    expect(roundTo('1.23456', 2, 'down').toString()).toBe('1.23');
  });

  it('formats fixed strings without exponent notation', () => {
    expect(toFixedString('0.00000001', 8)).toBe('0.00000001');
    expect(toFixedString('1.5', 3)).toBe('1.500');
  });

  it('detects decimal strings', () => {
    expect(isDecimalString('1.2345')).toBe(true);
    expect(isDecimalString('abc')).toBe(false);
    expect(isDecimalString('Infinity')).toBe(false);
  });
});

describe('result', () => {
  it('maps and chains', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(mapResult(err('x'), (n: number) => n * 3)).toEqual(err('x'));
    expect(andThen(ok(2), (n) => (n > 1 ? ok(n) : err('small')))).toEqual(ok(2));
  });

  it('combines and returns the first error', () => {
    expect(combine([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(combine([ok(1), err('a'), err('b')])).toEqual(err('a'));
  });
});

describe('errors', () => {
  it('maps every error to a user-facing message with a recovery action', () => {
    const view = describeError(validationError('bad field'));
    expect(view.title).toBeTruthy();
    expect(view.recovery).toBeTruthy();
    expect(view.body).not.toContain('bad field');
  });

  it('wraps unknown thrown values', () => {
    expect(fromUnknown('StorageError', 'save', new Error('disk full')).message).toBe('save: disk full');
    expect(fromUnknown('Timeout', 'load', 'oops').message).toBe('load: oops');
  });
});

describe('ids', () => {
  it('creates prefixed, time-sortable, deterministic ids', () => {
    const random = () => 0.5;
    const a = createId('jrn', 1_000, random);
    const b = createId('jrn', 2_000, random);
    expect(hasIdPrefix(a, 'jrn')).toBe(true);
    expect(a < b).toBe(true);
    expect(createId('jrn', 1_000, random)).toBe(a);
  });

  it('rejects invalid prefixes', () => {
    expect(() => createId('Bad-Prefix', 0)).toThrow(RangeError);
  });
});

describe('time', () => {
  it('produces and validates UTC ISO strings', () => {
    const iso = toUtcIso(fixedClock('2026-01-02T03:04:05.000Z').now());
    expect(iso).toBe('2026-01-02T03:04:05.000Z');
    expect(isUtcIso(iso)).toBe(true);
    expect(isUtcIso('2026-01-02T03:04:05+01:00')).toBe(false);
    expect(() => toUtcIso(new Date('nope'))).toThrow(RangeError);
  });

  it('reads the device time zone, falling back to the default when invalid', () => {
    expect(isValidTimeZone(deviceTimeZone())).toBe(true);
    const spy = jest.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Not/AZone' } as Intl.ResolvedDateTimeFormatOptions);
    expect(deviceTimeZone()).toBe('Africa/Lagos');
    spy.mockRestore();
  });

  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Africa/Lagos')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('hash', () => {
  it('is stable', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });
});
