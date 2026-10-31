import { dec } from '../../../shared/decimal';
import { nextCandle, placeOrder, replayView, startReplay, stepBack, type ReplayState } from '../replay';
import { generateScenario } from '../scenarios';

/**
 * Phase 12 performance: step-back history must not keep a copy of the
 * revealed candles for every step. On a long real-data replay that grew as
 * steps × candles. History now keeps how many candles were revealed, and
 * step back rebuilds the candles from the same series.
 */

const SERIES = generateScenario({ kind: 'range', seed: 3, timeframe: 'H1', count: 6000 }).candles;

function started(revealed: number): ReplayState {
  const r = startReplay(SERIES, revealed, dec(10000));
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

/** Array elements reachable from the step-back history, one level deep. */
function retainedInHistory(s: ReplayState): number {
  return s.past.reduce((n, p) => n + Object.values(p).reduce((m: number, v) => m + (Array.isArray(v) ? v.length : 0), 0), 0);
}

describe('replay history', () => {
  it('does not keep the candles for every step', () => {
    let s = started(3000);
    for (let i = 0; i < 300; i += 1) s = nextCandle(s);
    expect(s.past).toHaveLength(300);
    // Before: about 300 × 3,000 candle references.
    expect(retainedInHistory(s)).toBeLessThan(1000);
  });

  it('stepping back restores exactly what was shown, including orders', () => {
    let s = started(3000);
    const views = [replayView(s)];
    for (let i = 0; i < 20; i += 1) {
      if (i === 5) {
        const placed = placeOrder(s, { side: 'buy', type: 'market', units: dec(1000) });
        if (!placed.ok) throw new Error(placed.error.message);
        s = placed.value;
        views.push(replayView(s));
      }
      s = nextCandle(s);
      views.push(replayView(s));
    }
    for (let i = views.length - 1; i > 0; i -= 1) {
      expect(replayView(s)).toEqual(views[i]);
      s = stepBack(s);
    }
    expect(replayView(s)).toEqual(views[0]);
    expect(s.past).toHaveLength(0);
    // The full series is still there: the replay can run to the end again.
    expect(replayView(s).remaining).toBe(SERIES.length - 3000);
  });
});
