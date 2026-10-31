import { addDays, diffDays, isLocalDate, localDateIn, nextStudyDates, studyDatesBetween, toLocalDate, weekdayOf } from '../dates';
import { anchorTimeline, buildUnits, draftClasses, planSchedule, type ScheduleModule, type ScheduleSettings } from '../scheduler';

const d = toLocalDate;
const MON_FRI = [1, 2, 3, 4, 5] as const;

const mod = (id: string, lessons: number, minPracticeDays = 0): ScheduleModule => ({
  id,
  title: id,
  lessonIds: Array.from({ length: lessons }, (_, i) => `${id}-l${i + 1}`),
  checkpointQuizId: `${id}-check`,
  minPracticeDays,
});

const settings = (over: Partial<ScheduleSettings> = {}): ScheduleSettings => ({
  startDate: d('2026-11-02'), // Monday
  timeline: { kind: 'weeks', weeks: 4 },
  studyDays: [...MON_FRI],
  dailyMinutes: 15,
  ...over,
});

describe('dates', () => {
  it('validates, adds, diffs and finds weekdays', () => {
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(diffDays(d('2026-11-02'), d('2026-11-09'))).toBe(7);
    expect(weekdayOf(d('2026-11-02'))).toBe(1);
    expect(() => toLocalDate('nope')).toThrow(RangeError);
  });

  it('lists study dates', () => {
    expect(studyDatesBetween(d('2026-11-02'), d('2026-11-08'), [1, 3])).toEqual(['2026-11-02', '2026-11-04']);
    expect(nextStudyDates(d('2026-11-07'), 2, [1])).toEqual(['2026-11-09', '2026-11-16']);
    expect(nextStudyDates(d('2026-11-07'), 2, [])).toEqual([]);
  });

  it('converts an instant to a local date in a time zone', () => {
    expect(localDateIn(new Date('2026-11-01T23:30:00Z'), 'Africa/Lagos')).toBe('2026-11-02');
    expect(localDateIn(new Date('2026-11-01T23:30:00Z'), 'UTC')).toBe('2026-11-01');
  });
});

describe('draftClasses', () => {
  it('packs lessons by daily minutes, puts checkpoints alone, and adds a review every 5th class', () => {
    const drafts = draftClasses([mod('a', 4), mod('b', 4)], null, 30);
    expect(drafts.map((c) => c.kind)).toEqual(['lesson', 'lesson', 'checkpoint', 'lesson', 'review', 'lesson', 'checkpoint']);
    expect(drafts[0]?.unitIds).toEqual(['a:a-l1', 'a:a-l2']);
  });

  it('spreads practice modules over their minimum days even with long classes', () => {
    const drafts = draftClasses([mod('p', 6, 3)], null, 90);
    expect(drafts.filter((c) => c.kind === 'lesson')).toHaveLength(3);
  });

  it('only schedules remaining units', () => {
    const remaining = new Set(buildUnits([mod('a', 3)]).slice(2).map((u) => u.id));
    expect(draftClasses([mod('a', 3)], remaining, 15).flatMap((c) => c.unitIds)).toEqual(['a:a-l3', 'a:checkpoint']);
  });
});

describe('planSchedule', () => {
  it('fits a program into the chosen weeks with one class per study day', () => {
    // 16 lessons + 2 checkpoints + 4 review classes = 22 classes; 6 weeks of weekdays = 30 days.
    const plan = planSchedule([mod('a', 8), mod('b', 8)], settings({ timeline: { kind: 'weeks', weeks: 6 } }));
    expect(plan.warnings).toEqual([]);
    expect(plan.totalClasses).toBe(22);
    expect(new Set(plan.classes.map((c) => c.date)).size).toBe(22);
    expect(plan.classes.every((c) => MON_FRI.includes(weekdayOf(c.date) as 1))).toBe(true);
    expect(plan.finishDate! <= '2026-12-13').toBe(true);
    expect(plan.minutesPerClass).toBe(15);
  });

  it('warns when too tight and suggests the nearest realistic options without changing anything', () => {
    const plan = planSchedule([mod('a', 12), mod('b', 12)], settings({ timeline: { kind: 'weeks', weeks: 2 } }));
    expect(plan.warnings[0]).toMatchObject({ kind: 'too_tight', availableDays: 10 });
    expect(plan.suggestions).toEqual(
      expect.arrayContaining([
        { kind: 'dailyMinutes', value: 60 },
        { kind: 'weeks', value: 8 },
        expect.objectContaining({ kind: 'finishDate' }),
      ]),
    );
    expect(plan.finishDate! > plan.targetDate!).toBe(true);
    expect(plan.minutesPerClass).toBe(15);
  });

  it('warns when too thin and suggests a shorter length', () => {
    const plan = planSchedule([mod('a', 3)], settings({ timeline: { kind: 'weeks', weeks: 24 } }));
    expect(plan.warnings[0]?.kind).toBe('too_thin');
    expect(plan.suggestions).toEqual([{ kind: 'weeks', value: 2 }]);
    const dates = plan.classes.map((c) => c.date);
    expect(diffDays(dates[0]!, dates[1]!)).toBeGreaterThan(7);
  });

  it('accepts a target finish date and an open timeline', () => {
    const byDate = planSchedule([mod('a', 4)], settings({ timeline: { kind: 'finishDate', date: d('2026-11-13') } }));
    expect(byDate.availableDays).toBe(10);
    const open = planSchedule([mod('a', 4)], settings({ timeline: { kind: 'open' } }));
    // 4 lessons + checkpoint + the review class before the 5th = 6 consecutive study days.
    expect(open.classes.map((c) => c.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09']);
  });

  it('flags practice modules squeezed by a tight plan', () => {
    const plan = planSchedule([mod('p', 6, 6)], settings({ timeline: { kind: 'weeks', weeks: 1 }, studyDays: [1] }));
    expect(plan.warnings.map((w) => w.kind)).toEqual(expect.arrayContaining(['too_tight']));
  });

  it('uses extra catch-up dates', () => {
    const plan = planSchedule([mod('a', 1)], settings({ studyDays: [3], extraDates: [d('2026-11-02')], timeline: { kind: 'open' } }));
    expect(plan.classes[0]?.date).toBe('2026-11-02');
  });

  it('handles empty input safely', () => {
    expect(planSchedule([], settings()).warnings).toEqual([{ kind: 'nothing_to_schedule' }]);
    expect(planSchedule([mod('a', 1)], settings({ studyDays: [] })).warnings).toEqual([{ kind: 'no_study_days' }]);
  });

  it('warns that 10-minute classes cannot hold a 15-minute unit', () => {
    const plan = planSchedule([mod('a', 2)], settings({ dailyMinutes: 10 }));
    expect(plan.warnings).toEqual(expect.arrayContaining([{ kind: 'class_longer_than_minutes', unitMinutes: 15 }]));
  });

  it('an open timeline with several extra dates never skips study days', () => {
    const plan = planSchedule([mod('a', 5)], settings({ timeline: { kind: 'open' }, extraDates: [d('2026-11-07'), d('2026-11-08')] }));
    expect(plan.classes.map((c) => c.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });

  it('anchors a weeks timeline to the program start', () => {
    expect(anchorTimeline(settings(), d('2026-10-29')).timeline).toEqual({ kind: 'finishDate', date: '2026-11-25' });
    const fixed = settings({ timeline: { kind: 'finishDate', date: d('2026-12-01') } });
    expect(anchorTimeline(fixed, d('2026-10-29'))).toBe(fixed);
  });

  it('is deterministic', () => {
    expect(planSchedule([mod('a', 7)], settings())).toEqual(planSchedule([mod('a', 7)], settings()));
  });
});
