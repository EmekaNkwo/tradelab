import { CSV_LIMITS, detectTimeframe, parseOhlcvCsv as parseWith, parseTimestamp, parseUtcOffset, formatUtcOffset } from '../csvImport';
import { hourlyCsv } from '../../../testing/csvFixtures';

const NOW = Date.UTC(2026, 9, 29, 10);
const parseOhlcvCsv = (text: string, utcOffsetMinutes = 0) => parseWith(text, { nowMs: NOW, utcOffsetMinutes });
const lines = (text: string) => text.split('\n');
const withLine = (text: string, index: number, line: string) => lines(text).map((l, i) => (i === index ? line : l)).join('\n');

describe('CSV OHLCV import (spec §30)', () => {
  it('reads a clean hourly file, in UTC, and reports what it assumed', () => {
    const { candles, report } = parseOhlcvCsv(hourlyCsv(60));
    expect(report.status).toBe('warnings');
    expect(report.candles).toBe(60);
    expect(report.timeframe).toBe('H1');
    expect(report.first).toBe('2024-01-01T00:00:00.000Z');
    expect(report.hasVolume).toBe(true);
    expect(report.warnings.join(' ')).toMatch(/no time zone, so they were read as UTC/);
    expect(report.warnings.at(-1)).toMatch(/does not adjust for splits, dividends or futures rollovers/);
    expect(candles[1]?.open.toString()).toBe('1.1001');
  });

  it('is ok with only the adjustment note when times carry a zone', () => {
    const csv = lines(hourlyCsv(60)).map((l, i) => (i === 0 ? l : l.replace(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d),/, '$1T$2:00Z,'))).join('\n');
    const { report } = parseOhlcvCsv(csv);
    expect(report.status).toBe('ok');
    expect(report.warnings).toHaveLength(1);
  });

  it('accepts semicolons, tabs, quoted cells and header aliases', () => {
    expect(parseOhlcvCsv(hourlyCsv(60, { delimiter: ';' })).report.candles).toBe(60);
    expect(parseOhlcvCsv(hourlyCsv(60, { delimiter: '\t' })).report.candles).toBe(60);
    const quoted = lines(hourlyCsv(60)).map((l, i) => (i === 0 ? '"Date/Time","O","H","L","Last","Vol"' : l.replace(/^([^,]+),/, '"$1",'))).join('\n');
    expect(parseOhlcvCsv(quoted).report.candles).toBe(60);
  });

  it('refuses a file without the needed columns', () => {
    const r = parseOhlcvCsv('when,price\n2024-01-01,1');
    expect(r.report.status).toBe('refused');
    expect(r.report.errors[0]).toMatch(/Missing: time, open, high, low/);
  });

  it.each([
    ['a non-number', '2024-01-01 05:00,abc,1.2,1.0,1.1,1', /line 7/],
    ['a high below the close', '2024-01-01 05:00,1.1,1.1,1.0,1.2,1', /line 7/],
    ['a zero price', '2024-01-01 05:00,0,1.2,0,1.1,1', /line 7/],
    ['negative volume', '2024-01-01 05:00,1.1,1.2,1.0,1.1,-5', /line 7/],
    ['an impossible date', '2024-02-30 05:00,1.1,1.2,1.0,1.1,1', /line 7/],
  ])('refuses %s, naming the line', (_name, line, message) => {
    const r = parseOhlcvCsv(withLine(hourlyCsv(60), 6, line));
    expect(r.report.status).toBe('refused');
    expect(r.report.errors.join(' ')).toMatch(message);
    expect(r.candles).toHaveLength(0);
  });

  it('refuses duplicates and mixed order, and reverses newest-first data with a note', () => {
    const csv = hourlyCsv(60);
    expect(parseOhlcvCsv(withLine(csv, 6, lines(csv)[5] as string)).report.status).toBe('refused');
    const swapped = lines(csv);
    [swapped[10], swapped[11]] = [swapped[11] as string, swapped[10] as string];
    expect(parseOhlcvCsv(swapped.join('\n')).report.status).toBe('refused');
    const [header, ...rows] = lines(csv);
    const reversed = parseOhlcvCsv([header, ...rows.reverse()].join('\n'));
    expect(reversed.report.status).toBe('warnings');
    expect(reversed.report.warnings[0]).toMatch(/newest-first/);
    expect(reversed.report.first).toBe('2024-01-01T00:00:00.000Z');
  });

  it('refuses too few candles, unknown spacing and off-grid times; counts gaps', () => {
    expect(parseOhlcvCsv(hourlyCsv(CSV_LIMITS.minCandles - 1)).report.errors[0]).toMatch(/At least 50 candles/);
    expect(parseOhlcvCsv(hourlyCsv(60, { stepMs: 7 * 60_000 })).report.errors[0]).toMatch(/does not match any timeframe/);
    const offGrid = withLine(hourlyCsv(60), 30, lines(hourlyCsv(60))[30]?.replace(':00,', ':30,') as string);
    expect(parseOhlcvCsv(offGrid).report.status).toBe('refused');
    const gapped = lines(hourlyCsv(60)).filter((_, i) => i !== 20 && i !== 40).join('\n');
    expect(parseOhlcvCsv(gapped).report.warnings.join(' ')).toMatch(/2 gaps where candles are missing/);
  });

  it('refuses files over 5 MB', () => {
    expect(parseOhlcvCsv('x'.repeat(CSV_LIMITS.maxBytes + 1)).report.errors[0]).toMatch(/larger than 5 MB/);
  });

  it('notes missing volume', () => {
    const csv = lines(hourlyCsv(60)).map((l) => l.split(',').slice(0, 5).join(',')).join('\n');
    const r = parseOhlcvCsv(csv);
    expect(r.report.hasVolume).toBe(false);
    expect(r.report.warnings.join(' ')).toMatch(/There is no volume/);
  });

  it('parses epoch seconds, milliseconds and zoned ISO times', () => {
    expect(parseTimestamp('1704067200')?.ms).toBe(Date.UTC(2024, 0, 1));
    expect(parseTimestamp('1704067200000')?.ms).toBe(Date.UTC(2024, 0, 1));
    expect(parseTimestamp('2024-01-01T01:00:00+01:00')?.ms).toBe(Date.UTC(2024, 0, 1));
    expect(parseTimestamp('not a date')).toBeNull();
    expect(detectTimeframe([0, 86_400_000, 2 * 86_400_000])).toBe('D1');
  });

  it('joins separate date and time columns, including MetaTrader exports', () => {
    const mt = ['<DATE>,<TIME>,<OPEN>,<HIGH>,<LOW>,<CLOSE>,<TICKVOL>', ...Array.from({ length: 60 }, (_, i) => `2024.01.02,${String(i % 24).padStart(2, '0')}:00:00,1.1,1.2,1.0,1.1,${i}`)];
    // 60 hourly rows spill past midnight; give each its own day and hour.
    const rows = mt.map((l, i) => (i === 0 ? l : l.replace('2024.01.02', `2024.01.${String(2 + Math.floor((i - 1) / 24)).padStart(2, '0')}`)));
    const r = parseOhlcvCsv(rows.join('\n'));
    expect(r.report.status).not.toBe('refused');
    expect(r.report.timeframe).toBe('H1');
    expect(r.report.first).toBe('2024-01-02T00:00:00.000Z');
  });

  it('says the date and time columns were joined when that produces duplicates', () => {
    const csv = ['Date,Time,Open,High,Low,Close', ...Array.from({ length: 60 }, () => '2024-01-02,09:00,1.1,1.2,1.0,1.1')].join('\n');
    const r = parseOhlcvCsv(csv);
    expect(r.report.errors[0]).toMatch(/separate columns and were joined/);
  });

  it('applies the chosen UTC offset to zone-less times, and not to zoned ones', () => {
    const r = parseOhlcvCsv(hourlyCsv(60), 120);
    expect(r.report.first).toBe('2023-12-31T22:00:00.000Z');
    expect(r.report.warnings.join(' ')).toMatch(/read as UTC\+02:00 \(the offset you chose\)/);
    expect(parseUtcOffset('+02:00')).toBe(120);
    expect(parseUtcOffset('-05:30')).toBe(-330);
    expect(parseUtcOffset('Europe/London')).toBeNull();
    expect(parseUtcOffset('+15:00')).toBeNull();
    expect(formatUtcOffset(-330)).toBe('-05:30');
  });

  it('refuses prices with more than 18 significant digits', () => {
    const r = parseOhlcvCsv(withLine(hourlyCsv(60), 6, '2024-01-01 05:00,1.1234567890123456789,1.2,1.0,1.1,1'));
    expect(r.report.errors.join(' ')).toMatch(/line 7: .*at most 18 digits/);
  });

  it('refuses candles dated in the future, with a small margin for clock skew', () => {
    const recent = hourlyCsv(60, { startMs: NOW - 59 * 3_600_000 });
    expect(parseOhlcvCsv(recent).report.status).not.toBe('refused');
    const future = hourlyCsv(60, { startMs: NOW - 50 * 3_600_000 });
    expect(parseOhlcvCsv(future).report.errors[0]).toMatch(/in the future/);
  });
});
