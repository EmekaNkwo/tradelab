import { createDrill, DRILL_KINDS, gradeDrill, isNeutralAnswer } from '../drills';

describe('drills', () => {
  it.each(DRILL_KINDS)('%s: deterministic, answerable, and every option has reasoning', (kind) => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = createDrill(kind, seed);
      const b = createDrill(kind, seed);
      expect(b.prompt).toBe(a.prompt);
      expect(b.options).toEqual(a.options);
      expect(a.options.map((o) => o.id)).toContain(a.correctOptionId);
      expect(new Set(a.options.map((o) => o.text)).size).toBe(a.options.length);
      for (const o of a.options) expect(a.feedback[o.id]!.length).toBeGreaterThanOrEqual(2);
      expect(a.shownBefore).toBeGreaterThan(0);
      expect(a.shownBefore).toBeLessThanOrEqual(a.scenario.candles.length);
      expect(a.scenario.label).toBe('Simulated scenario');
    }
  });

  it('grades the committed choice', () => {
    const d = createDrill('where_is_the_stop', 3);
    expect(gradeDrill(d, 'swing').correct).toBe(true);
    expect(gradeDrill(d, 'none')).toMatchObject({ correct: false });
    expect(gradeDrill(d, 'unknown').feedback).toEqual([]);
  });

  it('breakout drills hide the outcome until after the answer and describe it afterwards', () => {
    const d = createDrill('breakout_or_fake', 9);
    expect(d.shownBefore).toBe(d.scenario.truth.keyIndex! + 3);
    expect(d.shownBefore).toBeLessThan(d.scenario.candles.length);
    expect(d.outcome).toMatch(/range/);
    expect(gradeDrill(d, 'wait').correct).toBe(false);
    expect(gradeDrill(d, 'wait').feedback[0]).toMatch(/valid plan/);
  });

  it('size it uses the position-size rule: rounded down, 1% risk', () => {
    const d = createDrill('size_it', 4);
    const right = d.options.find((o) => o.id === 'right')!;
    const lots = Number(right.text.split(' ')[0]);
    const [, balance, stop] = /Account (\d+) USD, risk 1%, stop (\d+) pips/.exec(d.prompt)!;
    expect(lots * Number(stop) * 10).toBeLessThanOrEqual(Number(balance) * 0.01 + 1e-9);
    expect((lots + 0.01) * Number(stop) * 10).toBeGreaterThan(Number(balance) * 0.01);
  });
});

describe('drill fairness (Phase 4 review)', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1);

  it('breakout or fake cannot be answered from the break direction', () => {
    const seen = new Set<string>();
    for (const seed of seeds) {
      const d = createDrill('breakout_or_fake', seed);
      seen.add(`${d.correctOptionId}:${d.scenario.truth.overallTrend}`);
    }
    // A real break keeps its direction; a fake one reverses. All four combinations must occur.
    expect(seen).toEqual(new Set(['real:up', 'real:down', 'fake:up', 'fake:down']));
  });

  it('the right answer is not always in the same position', () => {
    for (const kind of DRILL_KINDS) {
      const positions = new Set(seeds.slice(0, 40).map((seed) => {
        const d = createDrill(kind, seed);
        return d.options.findIndex((o) => o.id === d.correctOptionId);
      }));
      expect(positions.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('waiting is neutral, not wrong', () => {
    const d = createDrill('breakout_or_fake', 3);
    expect(gradeDrill(d, 'wait')).toMatchObject({ correct: false, neutral: true });
    expect(gradeDrill(d, d.correctOptionId).neutral).toBe(false);
    expect(isNeutralAnswer('breakout_or_fake', 'wait')).toBe(true);
    expect(isNeutralAnswer('size_it', 'wait')).toBe(false);
  });

  it('size it feedback states the real risk of the wrong sizes', () => {
    const d = createDrill('size_it', 4);
    const [, balance, stop] = /Account (\d+) USD, risk 1%, stop (\d+) pips/.exec(d.prompt)!;
    const tenX = d.options.find((o) => o.id === 'ten_x')!;
    const pct = ((Number(tenX.text.split(' ')[0]) * Number(stop) * 10) / Number(balance)) * 100;
    expect(d.feedback.ten_x![0]).toContain(`${pct.toFixed(1)}% of the account`);
    expect(d.feedback.round_up![0]).toMatch(/above the 1% limit/);
  });
});
