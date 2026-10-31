import { sessionsClock } from '../../../domain/plan';
import { arcHours, hourOfDay, sessionsDialView } from '../sessionsDial';

const LAGOS = 'Africa/Lagos';

describe('sessionsDialView', () => {
  // Thursday 29 Oct 2026, 10:00 UTC: London on winter time, New York not yet (Lagos is UTC+1).
  const ms = Date.parse('2026-10-29T10:00:00.000Z');
  const view = sessionsDialView(sessionsClock(ms), ms, LAGOS);
  const arc = (id: string) => view.arcs.find((a) => a.id === id)!;

  it('places the Now marker and each window on the 24-hour dial in the learner’s zone', () => {
    expect(view.nowHour).toBe(11);
    expect(view.nowLabel).toBe('Thu 11:00');
    expect(arc('london')).toEqual({ id: 'london', city: 'London', open: true, startHour: 9, hours: 9, range: '09:00 to 18:00' });
    expect(arc('new_york')).toMatchObject({ open: false, startHour: 13, hours: 9, range: 'opens Thu 13:00, until 22:00' });
    expect(view.arcs.map((a) => a.id)).toEqual(['sydney', 'tokyo', 'london', 'new_york']);
  });

  it('says the whole dial in words for screen readers', () => {
    expect(view.summary).toMatch(/^24-hour sessions dial in your time zone\. Now Thu 11:00\. /);
    expect(view.summary).toContain('London, open, 09:00 to 18:00');
    expect(view.summary).toContain('New York, closed, opens Thu 13:00, until 22:00');
    expect(view.summary).toMatch(/Solid rings are open now; dashed rings show the next opening\.$/);
    expect(view.summary).not.toMatch(/weekend/);
  });

  it('says when the forex market is closed for the weekend', () => {
    const sat = Date.parse('2026-10-31T12:00:00.000Z');
    const w = sessionsDialView(sessionsClock(sat), sat, LAGOS);
    expect(w.summary).toContain('forex market closed for the weekend');
    expect(w.arcs.every((a) => !a.open)).toBe(true);
    expect(w.arcs.every((a) => a.hours > 0 && a.hours <= 24)).toBe(true);
    // Closed sessions name the day of their next opening (Monday here), not a bare time.
    expect(w.summary).toContain('London, closed, opens Mon 09:00, until 18:00');
    expect(w.summary).toMatch(/Sydney, closed, opens (Sun|Mon) \d\d:\d\d, until \d\d:\d\d/);
  });

  it('measures arcs on the wall clock, so a daylight-saving change does not move the drawn end', () => {
    // Europe/London springs forward at 01:00 GMT on 29 Mar 2026: 00:30 GMT to 03:30 BST is 2 hours elapsed, 3 on the clock.
    expect(arcHours(Date.parse('2026-03-29T00:30:00.000Z'), Date.parse('2026-03-29T02:30:00.000Z'), 'Europe/London')).toBe(3);
    expect(arcHours(Date.parse('2026-10-29T09:00:00.000Z'), Date.parse('2026-10-29T18:00:00.000Z'), 'UTC')).toBe(9);
    // Across midnight.
    expect(arcHours(Date.parse('2026-10-29T21:00:00.000Z'), Date.parse('2026-10-30T06:00:00.000Z'), 'UTC')).toBe(9);
    expect(arcHours(1000, 1000, 'UTC')).toBe(0);
    expect(arcHours(2000, 1000, 'UTC')).toBe(0);
    expect(arcHours(0, 24 * 3_600_000, 'UTC')).toBe(24);
  });

  it('hourOfDay counts minutes as a fraction', () => {
    expect(hourOfDay(Date.parse('2026-10-29T10:30:00.000Z'), LAGOS)).toBe(11.5);
    expect(hourOfDay(Date.parse('2026-10-29T23:15:00.000Z'), 'UTC')).toBe(23.25);
  });
});
