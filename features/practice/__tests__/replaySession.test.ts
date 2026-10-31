import { dec } from '../../../shared/decimal';
import { logger } from '../../../shared/logger';
import { createTestHarness } from '../../../testing/harness';
import {
  applyAction,
  emptyOrderForm,
  parseOrderForm,
  replayView,
  REPLAY_CANDLES,
  saveReplay,
  SCENARIO_LABELS,
  seedFrom,
  startIndexFor,
  startSession,
  type ReplaySetup,
} from '../replaySession';
import { SCENARIO_KINDS } from '../../../domain/market';
import type { ReplayState } from '../../../domain/market';

const setup: ReplaySetup = { kind: 'breakout', seed: 42, timeframe: 'H1', balance: '10000' };
const must = <T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('replay sessions', () => {
  it('labels every scenario and starts in the first third, chosen by the seed', () => {
    for (const k of SCENARIO_KINDS) expect(SCENARIO_LABELS[k]).toBeTruthy();
    for (const seed of [1, 7, 99999, 2147483646]) {
      const i = startIndexFor(seed);
      expect(i).toBeGreaterThanOrEqual(60);
      expect(i).toBeLessThan(REPLAY_CANDLES / 3);
    }
    expect(seedFrom(new Date(0))).toBe(1);
    expect(seedFrom(new Date('2026-10-29T10:00:00Z'))).toBeGreaterThan(0);
  });

  it('the view never contains candles that have not been revealed', () => {
    const s = must(startSession(setup));
    const view = replayView(s);
    expect(view.candles).toHaveLength(startIndexFor(42));
    expect(view.remaining).toBe(REPLAY_CANDLES - startIndexFor(42));
    expect(Object.keys(view)).not.toContain('upcoming');
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(s.upcoming[0]!.time));
    const next = must(applyAction(s, { type: 'next' }));
    expect(replayView(next).candles).toHaveLength(view.candles.length + 1);
    expect(replayView(must(applyAction(next, { type: 'back' }))).candles).toHaveLength(view.candles.length);
  });

  it('is deterministic for a seed and rejects a bad balance', () => {
    expect(replayView(must(startSession(setup))).candles).toEqual(replayView(must(startSession(setup))).candles);
    expect(startSession({ ...setup, balance: 'lots' }).ok).toBe(false);
  });

  it('parses the order form: lots to units, comma decimals, required prices', () => {
    const market = must(parseOrderForm({ ...emptyOrderForm, lots: '0,25', stopLoss: '1.05', takeProfit: '' }));
    expect(market.units.toString()).toBe('25000');
    expect(market.stopLoss!.toString()).toBe('1.05');
    expect(market.takeProfit).toBeUndefined();
    expect(market.price).toBeUndefined();
    expect(parseOrderForm({ ...emptyOrderForm, lots: '' }).ok).toBe(false);
    expect(parseOrderForm({ ...emptyOrderForm, lots: '-1' }).ok).toBe(false);
    expect(parseOrderForm({ ...emptyOrderForm, stopLoss: 'abc' }).ok).toBe(false);
    expect(parseOrderForm({ ...emptyOrderForm, type: 'limit' }).ok).toBe(false);
    expect(must(parseOrderForm({ ...emptyOrderForm, type: 'limit', price: '1.0' })).price!.toString()).toBe('1');
  });

  it('places, edits, half-closes, and closes through actions; errors leave the state alone', () => {
    let s: ReplayState = must(startSession(setup));
    const last = Number(replayView(s).candles.at(-1)!.close);
    const bad = applyAction(s, { type: 'place', form: { ...emptyOrderForm, stopLoss: String(last + 1) } });
    expect(!bad.ok && bad.error.message).toMatch(/stop loss must be below/);
    s = must(applyAction(s, { type: 'place', form: { ...emptyOrderForm, stopLoss: String(last - 0.5) } }));
    s = must(applyAction(s, { type: 'next' }));
    expect(replayView(s).position).not.toBeNull();
    s = must(applyAction(s, { type: 'edit', stop: '', target: '' }));
    expect(replayView(s).position!.stopLoss).toBeNull();
    expect(applyAction(s, { type: 'edit', stop: 'x', target: '' }).ok).toBe(false);
    expect(applyAction(s, { type: 'edit', stop: '', target: 'x' }).ok).toBe(false);
    s = must(applyAction(s, { type: 'close', fraction: dec('0.5') }));
    expect(replayView(s).position!.units.toString()).toBe('5000');
    s = must(applyAction(s, { type: 'close', fraction: dec(1) }));
    expect(replayView(s).closed).toHaveLength(2);
    s = must(applyAction(s, { type: 'place', form: { ...emptyOrderForm, type: 'limit', price: String(last / 2) } }));
    expect(replayView(s).orders).toHaveLength(1);
    expect(replayView(must(applyAction(s, { type: 'cancel' }))).orders).toHaveLength(0);
  });

  it('saves each finished replay as a new record with a process review, but not with a trade open', async () => {
    const { container } = await createTestHarness();
    let s = must(startSession(setup));
    const last = Number(replayView(s).candles.at(-1)!.close);
    s = must(applyAction(s, { type: 'place', form: { ...emptyOrderForm, lots: '0.01', stopLoss: (last - 0.01).toFixed(5) } }));
    s = must(applyAction(s, { type: 'next' }));
    if (replayView(s).position) {
      expect((await saveReplay(container, setup, replayView(s), new Date(), '')).ok).toBe(false);
      s = must(applyAction(s, { type: 'close', fraction: dec(1) }));
    }
    const first = must(await saveReplay(container, setup, replayView(s), new Date('2026-10-29T09:00:00Z'), ' my plan '));
    // 0.01 lot = 1,000 units × 0.01 stop distance = 10 = 0.10% of 10,000.
    expect(first.review.processScore).toBe(1);
    expect(first.attempt.note).toBe('my plan');
    expect(first.attempt.trades[0]!.initialStop).toBe((last - 0.01).toFixed(5).replace(/0+$/, ''));
    await saveReplay(container, setup, replayView(s), new Date('2026-10-29T09:30:00Z'), '');
    const all = await container.practice.replayAttempts();
    expect(all.ok && all.value).toHaveLength(2);
    // Each saved replay's trade also reaches the journal, linked to its attempt (this once failed silently).
    const journal = await container.journal.list({ source: 'replay' });
    expect(journal.ok && journal.value.filter((e) => e.sourceRef === first.attempt.id)).toHaveLength(1);
  });

  it('journals a replay trade placed without a stop, and logs no journal failure', async () => {
    const { container } = await createTestHarness();
    const warn = jest.spyOn(logger, 'warn');
    let s = must(startSession(setup));
    s = must(applyAction(s, { type: 'place', form: { ...emptyOrderForm, lots: '0.01' } }));
    s = must(applyAction(s, { type: 'next' }));
    s = must(applyAction(s, { type: 'close', fraction: dec(1) }));
    const saved = must(await saveReplay(container, setup, replayView(s), new Date('2026-10-29T09:00:00Z'), ''));
    const journal = await container.journal.list({ source: 'replay' });
    const [entry] = journal.ok ? journal.value : [];
    expect(entry).toMatchObject({ sourceRef: saved.attempt.id, stop: null, plannedRisk: null, pnlR: null });
    expect(warn).not.toHaveBeenCalledWith('Journal entries for a replay failed', expect.anything());
    warn.mockRestore();
  });
});
