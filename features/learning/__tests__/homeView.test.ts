import type { DailyClass } from '../../../domain/models/learning';
import { classPosition, dueSignal, greetingFor, localHour, programPercent } from '../homeView';

const cls = (id: string) => ({ id }) as DailyClass;

describe('Home view-model', () => {
  it('greets by the hour of the learner’s day', () => {
    expect(greetingFor(5)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good afternoon');
    expect(greetingFor(18)).toBe('Good evening');
    expect(greetingFor(2)).toBe('Good evening');
  });

  it('reads the hour on the learner’s wall clock, not UTC', () => {
    const instant = new Date('2026-10-29T10:00:00.000Z');
    expect(localHour(instant, 'Africa/Lagos')).toBe(11);
    expect(localHour(instant, 'America/New_York')).toBe(6);
    expect(localHour(new Date('2026-10-29T23:30:00.000Z'), 'UTC')).toBe(23);
  });

  it('places a class in the schedule', () => {
    const classes = [cls('a'), cls('b'), cls('c')];
    expect(classPosition(classes, cls('b'))).toEqual({ number: 2, of: 3 });
    expect(classPosition(classes, cls('z'))).toBeNull();
  });

  it('rounds program progress and never divides by zero', () => {
    expect(programPercent({ completedUnits: 1, totalUnits: 3 })).toBe(33);
    expect(programPercent({ completedUnits: 0, totalUnits: 0 })).toBe(0);
    expect(programPercent({ completedUnits: 9, totalUnits: 3 })).toBe(100);
  });

  it('marks the bell only when a class or review is really due', () => {
    expect(dueSignal({ todaysClass: null, dueReviews: 0 })).toEqual({ due: false, label: 'Reminders: nothing is due' });
    expect(dueSignal({ todaysClass: cls('a'), dueReviews: 0 })).toEqual({ due: true, label: "Reminders: today's class is waiting" });
    expect(dueSignal({ todaysClass: null, dueReviews: 1 }).label).toBe('Reminders: 1 review is due');
    expect(dueSignal({ todaysClass: cls('a'), dueReviews: 3 }).label).toBe("Reminders: today's class is waiting, and 3 reviews are due");
  });
});
