import { changedFields, CHECKLIST, clockTime, dayAndTime, nextForexReopen, EMPTY_PLAN, evaluateChecklist, forexWeekendAt, planIssues, sessionsClock, type TradingPlan } from '..';

const at = (iso: string) => Date.parse(iso);
const openIds = (iso: string) => sessionsClock(at(iso)).statuses.filter((s) => s.open).map((s) => s.session.id);

describe('sessions clock', () => {
  it('opens London and New York in winter, with their overlap in UTC 13:00–17:00', () => {
    // Wednesday; London is UTC+0 and New York UTC−5 in January.
    const clock = sessionsClock(at('2026-01-14T14:30:00Z'));
    expect(openIds('2026-01-14T14:30:00Z')).toEqual(['london', 'new_york']);
    const ln = clock.overlaps.find((o) => o.sessions[0] === 'london')!;
    expect([new Date(ln.window.openMs).toISOString(), new Date(ln.window.closeMs).toISOString()]).toEqual(['2026-01-14T13:00:00.000Z', '2026-01-14T17:00:00.000Z']);
    expect(clockTime(ln.window.openMs, 'Africa/Lagos')).toBe('14:00');
  });

  it('moves with each city’s daylight saving', () => {
    // July: London UTC+1 (07:00–16:00 UTC), New York UTC−4 (12:00–21:00 UTC).
    const clock = sessionsClock(at('2026-07-15T14:30:00Z'));
    const ln = clock.overlaps.find((o) => o.sessions[0] === 'london')!;
    expect(new Date(ln.window.openMs).toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(new Date(ln.window.closeMs).toISOString()).toBe('2026-07-15T16:00:00.000Z');
    // Sydney is UTC+10 in July (08:00–17:00 = 22:00–07:00 UTC), so it overlaps Tokyo's morning.
    expect(openIds('2026-07-15T06:30:00Z')).toEqual(['sydney', 'tokyo']);
  });

  it('treats Friday 17:00 to Sunday 17:00 New York time as the forex weekend', () => {
    expect(forexWeekendAt(at('2026-01-16T21:30:00Z'))).toBe(false); // Fri 16:30 New York
    expect(forexWeekendAt(at('2026-01-16T22:30:00Z'))).toBe(true); // Fri 17:30 New York
    expect(sessionsClock(at('2026-01-17T12:00:00Z'))).toMatchObject({ weekend: true });
    expect(openIds('2026-01-17T12:00:00Z')).toEqual([]);
    // Sun 17:30 New York = Mon 09:30 Sydney (UTC+11): the week has opened in Sydney.
    expect(openIds('2026-01-18T22:30:00Z')).toEqual(['sydney']);
  });

  it('shows the next opening when a session is closed', () => {
    const ny = sessionsClock(at('2026-01-14T06:00:00Z')).statuses.find((s) => s.session.id === 'new_york')!;
    expect(ny.open).toBe(false);
    expect(new Date(ny.window.openMs).toISOString()).toBe('2026-01-14T13:00:00.000Z');
  });
});

const PLAN: TradingPlan = {
  ...EMPTY_PLAN,
  instruments: ['EURUSD', 'GBPUSD'],
  sessions: ['london'],
  timeframes: ['H1'],
  entryRules: 'Retest of a broken level in the trend direction',
  exitRules: 'Target or stop; no early exit unless the setup is invalidated',
  stopRules: 'Beyond the last swing',
  stopTradingWhen: 'After 2 losses in a day',
};

describe('trading plan', () => {
  it('lists what is missing and accepts a complete plan', () => {
    expect(planIssues(EMPTY_PLAN).map((i) => i.field)).toEqual(['instruments', 'sessions', 'timeframes', 'entryRules', 'exitRules', 'stopRules', 'stopTradingWhen']);
    expect(planIssues(PLAN)).toEqual([]);
  });

  it('checks ranges, duplicates, and a daily limit smaller than one trade', () => {
    expect(planIssues({ ...PLAN, instruments: ['EURUSD', 'eurusd'] }).map((i) => i.message)).toEqual(['Each instrument should be listed once']);
    expect(planIssues({ ...PLAN, riskPerTradePercent: 15 }).map((i) => i.field)).toEqual(['riskPerTradePercent']);
    expect(planIssues({ ...PLAN, maxTradesPerDay: 2.5 }).map((i) => i.field)).toEqual(['maxTradesPerDay']);
    expect(planIssues({ ...PLAN, riskPerTradePercent: 2, dailyLossPercent: 1 }).map((i) => i.field)).toEqual(['dailyLossPercent']);
    expect(planIssues({ ...PLAN, riskPerTradePercent: Number.NaN }).map((i) => i.field)).toEqual(['riskPerTradePercent']);
  });

  it('names the fields that changed between versions', () => {
    expect(changedFields(PLAN, { ...PLAN, maxTradesPerDay: 2, sessions: ['london', 'new_york'] })).toEqual(['sessions', 'maxTradesPerDay']);
    expect(changedFields(PLAN, PLAN)).toEqual([]);
  });
});

describe('pre-trade checklist', () => {
  it('is complete only when every item is answered and lists cautions, without blocking', () => {
    expect(evaluateChecklist({})).toMatchObject({ complete: false, unanswered: CHECKLIST.map((i) => i.id) });
    const fine = evaluateChecklist({ in_plan: 'yes', stop_set: 'yes', risk_within: 'yes', news_soon: 'no', calm: 'yes' });
    expect(fine).toEqual({ complete: true, unanswered: [], cautions: [] });
    const worried = evaluateChecklist({ in_plan: 'unsure', stop_set: 'yes', risk_within: 'yes', news_soon: 'yes', calm: 'no' });
    expect(worried.cautions.map((c) => c.id)).toEqual(['in_plan', 'news_soon', 'calm']);
  });
});

describe('sessions clock edges', () => {
  it('during the weekend shows Monday’s openings and the next overlaps after the weekend', () => {
    const clock = sessionsClock(at('2026-01-17T12:00:00Z'));
    const london = clock.statuses.find((s) => s.session.id === 'london')!;
    expect(new Date(london.window.openMs).toISOString()).toBe('2026-01-19T08:00:00.000Z');
    for (const o of clock.overlaps) expect(forexWeekendAt(o.window.openMs)).toBe(false);
  });

  it('labels times with the weekday in the chosen zone', () => {
    expect(dayAndTime(at('2026-01-18T23:30:00Z'), 'Asia/Tokyo')).toBe('Mon 08:30');
    expect(dayAndTime(at('2026-01-18T23:30:00Z'), 'UTC')).toBe('Sun 23:30');
  });
});

describe('sessions clock around the weekly reopen and daylight-saving changes', () => {
  const sydney = (iso: string) => sessionsClock(at(iso)).statuses.find((s) => s.session.id === 'sydney')!;
  const iso = (ms: number) => new Date(ms).toISOString();

  it('opens Sydney at the reopen when its Monday starts before it (northern winter)', () => {
    // Sydney Mon 08:00 AEDT = Sun 16:00 New York, an hour before the reopen at Sun 17:00 New York (22:00 UTC).
    const sat = sydney('2026-01-10T12:00:00Z');
    expect([sat.open, iso(sat.window.openMs), iso(sat.window.closeMs)]).toEqual([false, '2026-01-11T22:00:00.000Z', '2026-01-12T06:00:00.000Z']);
    const beforeReopen = sydney('2026-01-11T21:30:00Z');
    expect([beforeReopen.open, iso(beforeReopen.window.openMs)]).toEqual([false, '2026-01-11T22:00:00.000Z']);
    expect(sydney('2026-01-11T22:30:00Z').open).toBe(true);
    expect(nextForexReopen(at('2026-01-11T22:30:00Z'))).toBe(at('2026-01-18T22:00:00Z'));
  });

  it('opens Sydney at its own 08:00 when that is after the reopen (northern summer)', () => {
    // Sydney Mon 08:00 AEST = Sun 22:00 UTC; the reopen is Sun 17:00 EDT = 21:00 UTC.
    expect(iso(sydney('2026-07-11T12:00:00Z').window.openMs)).toBe('2026-07-12T22:00:00.000Z');
    expect(sydney('2026-07-12T21:30:00Z').open).toBe(false);
  });

  it('follows New York onto summer time before London (March)', () => {
    // 10 March: New York is on EDT from 8 March, London stays on GMT until 29 March.
    const ln = sessionsClock(at('2026-03-10T14:00:00Z')).overlaps.find((o) => o.sessions[0] === 'london')!;
    expect([iso(ln.window.openMs), iso(ln.window.closeMs)]).toEqual(['2026-03-10T12:00:00.000Z', '2026-03-10T17:00:00.000Z']);
  });

  it('follows Sydney off summer time (April)', () => {
    // Sydney leaves AEDT on 5 April, so Monday 08:00 AEST is Sunday 22:00 UTC, after the 21:00 UTC reopen.
    const s = sydney('2026-04-05T21:00:00Z');
    expect([s.open, iso(s.window.openMs)]).toEqual([false, '2026-04-05T22:00:00.000Z']);
  });
});
