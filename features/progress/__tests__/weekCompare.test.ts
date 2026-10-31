import type { LocalDate } from '../../../domain/learning/dates';
import type { AnswerRecord, CheckedTradeRecord, ReplayRecord } from '../../../domain/progress';
import { facts } from '../../../domain/progress/__tests__/fixtures';
import { weekStart } from '../dashboard';
import { COMPARED_WITH, localTime, weekComparison, weekLearning, weekTiles } from '../weekCompare';

const TZ = 'Africa/Lagos'; // UTC+1, no daylight saving
const answer = (at: string, correct: boolean): AnswerRecord => ({ questionId: at, skills: [], lessonId: null, contextId: 'm', correct, at });
const trade = (at: string, ruleBroken: boolean): CheckedTradeRecord => ({ ruleBroken, hasStop: true, hasRationale: false, emotionRated: false, reviewed: false, appVerified: true, at });
const replay = (at: string): ReplayRecord => ({ scenarioKind: 'range', processScore: 1, at });
const day = (d: string) => d as LocalDate;

// Weeks: last Mon 19 – Sun 25 Oct 2026, this Mon 26 Oct – Sun 1 Nov.
const f = facts({
  classDates: [day('2026-10-19'), day('2026-10-21'), day('2026-10-24'), day('2026-10-26'), day('2026-10-28')],
  answers: [
    answer('2026-10-19T07:00:00.000Z', true), // Mon 08:00 last week
    answer('2026-10-21T08:00:00.000Z', true), // Wed 09:00 last week
    answer('2026-10-21T16:00:00.000Z', false), // Wed 17:00 last week: after 14:00
    answer('2026-10-25T20:00:00.000Z', false), // Sun 21:00 last week
    answer('2026-10-26T07:00:00.000Z', true), // Mon 08:00 this week
    answer('2026-10-28T09:00:00.000Z', false), // Wed 10:00 this week
  ],
  checkedTrades: [trade('2026-10-20T12:00:00.000Z', false), trade('2026-10-27T12:00:00.000Z', true)],
  // 23:30 UTC on Sunday 25 Oct is 00:30 on Monday 26 Oct in Lagos: this week.
  replays: [replay('2026-10-25T23:30:00.000Z'), replay('2026-10-19T08:00:00.000Z')],
  timeZone: TZ,
});

describe('this week so far against the same point last week', () => {
  it('on Monday morning compares Monday so far with last Monday up to the same time', () => {
    const c = weekComparison(f, day('2026-10-26'), TZ, new Date('2026-10-26T08:00:00.000Z')); // Mon 09:00
    expect(c.from).toBe('2026-10-26');
    expect(c.thisWeek).toEqual({ classes: 1, answered: 1, correct: 1, checkedTrades: 0, withinRules: 0, replays: 1 });
    // Last Monday up to 09:00: the 08:00 answer and the 09:00 replay, not Wednesday's.
    expect(c.lastWeek).toEqual({ classes: 1, answered: 1, correct: 1, checkedTrades: 0, withinRules: 0, replays: 1 });
  });

  it('mid-week stops last week at the same weekday and time of day', () => {
    const c = weekComparison(f, day('2026-10-28'), TZ, new Date('2026-10-28T13:00:00.000Z')); // Wed 14:00
    expect(c.thisWeek).toEqual({ classes: 2, answered: 2, correct: 1, checkedTrades: 1, withinRules: 0, replays: 1 });
    // Wed 17:00 and Sunday are after the same point last week.
    expect(c.lastWeek).toEqual({ classes: 2, answered: 2, correct: 2, checkedTrades: 1, withinRules: 1, replays: 1 });
  });

  it('on Sunday night compares two whole weeks', () => {
    const c = weekComparison(f, day('2026-11-01'), TZ, new Date('2026-11-01T22:30:00.000Z')); // Sun 23:30
    expect(c.from).toBe('2026-10-26');
    expect(c.lastWeek).toEqual({ classes: 3, answered: 4, correct: 2, checkedTrades: 1, withinRules: 1, replays: 1 });
  });

  it('without a clock compares whole days through today', () => {
    expect(weekComparison(f, day('2026-10-28'), TZ).lastWeek.answered).toBe(3);
    expect(weekLearning(f, day('2026-10-19'), day('2026-10-19'), TZ).answered).toBe(1);
  });

  it('shares the dashboard’s Monday', () => {
    expect(weekStart(day('2026-11-01'))).toBe('2026-10-26');
    expect(localTime(new Date('2026-10-28T13:05:09.000Z'), TZ)).toBe('14:05:09');
  });

  it('builds tiles with honest changes: counts always, rates only when both spans have data', () => {
    const tiles = weekTiles(weekComparison(f, day('2026-10-28'), TZ, new Date('2026-10-28T13:00:00.000Z')));
    expect(tiles.map((t) => [t.key, t.value])).toEqual([
      ['classes', '2'],
      ['quiz', '50%'],
      ['rules', '0%'],
      ['replays', '1'],
    ]);
    expect(tiles[0]!.change).toEqual({ delta: 0, text: '0', subject: `Classes attended ${COMPARED_WITH}` });
    expect(tiles[1]!.change).toMatchObject({ delta: -50, text: '50 pts' });
    expect(tiles[2]!.change).toMatchObject({ delta: -100 });
    expect(tiles[1]!.spoken).toBe('Quiz accuracy this week so far, 50 percent, 1 of 2');
  });

  it('shows a dash, not 0%, when there is nothing to measure, and no rate change without last week’s data', () => {
    const tiles = weekTiles(weekComparison(facts({ timeZone: TZ, answers: [answer('2026-10-27T07:00:00.000Z', true)] }), day('2026-10-28'), TZ));
    const quiz = tiles.find((t) => t.key === 'quiz')!;
    expect(quiz.value).toBe('100%');
    expect(quiz.change).toBeNull();
    const rules = tiles.find((t) => t.key === 'rules')!;
    expect(rules.value).toBe('–');
    expect(rules.spoken).toMatch(/no checked trades yet/);
  });
});
