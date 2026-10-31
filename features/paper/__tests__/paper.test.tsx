import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { EXAMPLE_RISK_RULES } from '../../../domain/risk';
import { practiceInstrument, stopWidened, type PaperState } from '../../../domain/simulation';
import { dec } from '../../../shared/decimal';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { checkTicket, newPaperState, paperCandles, paperCooldown, paperStartIndex, type TicketForm } from '../paperSession';
import { useCreatePaperAccount, usePaperSession } from '../usePaper';

const fx = practiceInstrument('sim-eurusd')!;
const candles = paperCandles(fx, 'range', 5, 'H1');
const start = (): PaperState => {
  const s = newPaperState(fx, candles, 5, '10000');
  if (!s.ok) throw new Error(s.error.message);
  return s.value;
};
const mid = () => candles[paperStartIndex(5)]!.close;
const form = (o: Partial<TicketForm>): TicketForm => ({ side: 'buy', type: 'market', size: '0.1', price: '', stopLoss: '', takeProfit: '', ...o });

describe('checkTicket', () => {
  it('rejects bad input before any rule check', () => {
    expect(checkTicket(start(), fx, candles, form({ size: 'x' }), EXAMPLE_RISK_RULES).ok).toBe(false);
    expect(checkTicket(start(), fx, candles, form({ type: 'limit' }), EXAMPLE_RISK_RULES).ok).toBe(false);
    expect(checkTicket(start(), fx, candles, form({ stopLoss: '-1' }), EXAMPLE_RISK_RULES).ok).toBe(false);
  });

  it('computes planned loss with costs and lists every broken rule', () => {
    const stop = mid().minus('0.0100').toString();
    // 100 pips on 1 lot = 1,000 USD, plus half the spread (5) and 2 × 3.50 commission.
    const r = checkTicket(start(), fx, candles, form({ size: '1', stopLoss: stop }), EXAMPLE_RISK_RULES);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.plannedRisk?.toFixed(2)).toBe('1012.00');
    // 1 lot also needs 110,000 × 3.33% ≈ 3,663 of margin: above the 30% example limit.
    expect(r.value.violations.map((v) => v.rule)).toEqual(['risk_per_trade', 'margin_use']);
    expect(r.value.request.violations).toEqual(['risk_per_trade', 'margin_use']);
    expect(r.value.request.equityAtOrder.toString()).toBe('10000');
    const noStop = checkTicket(start(), fx, candles, form({}), EXAMPLE_RISK_RULES);
    expect(noStop.ok && noStop.value.violations.map((v) => v.rule)).toEqual(['no_stop']);
  });

  it('suggests a pause after a losing streak', () => {
    const lost = (positionId: number) => ({ positionId, net: dec(-10), plannedRisk: null }) as unknown as PaperState['history'][number];
    expect(paperCooldown({ ...start(), history: [lost(1), lost(2), lost(3)] }, EXAMPLE_RISK_RULES)?.reason).toBe('losing_streak');
    expect(paperCooldown({ ...start(), history: [lost(1), lost(1), lost(1)] }, EXAMPLE_RISK_RULES)).toBeNull();
    expect(paperCooldown(start(), EXAMPLE_RISK_RULES)).toBeNull();
  });
});

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
});
afterEach(() => harness.db.close());
const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={harness.container}>{children}</TestProviders>;

describe('usePaperSession', () => {
  it('places, fills, and closes a trade, saving state and journalling it with its rule break', async () => {
    const created = await renderHook(() => useCreatePaperAccount(), { wrapper });
    const account = await created.result.current({ name: 'FX', instrumentId: 'sim-eurusd', scenarioKind: 'range', timeframe: 'H1', balance: '10000' });
    if (!account.ok) throw new Error(account.error.message);
    const { result } = await renderHook(() => usePaperSession(account.value.id), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const ready = () => {
      if (result.current.status !== 'ready') throw new Error('not ready');
      return result.current;
    };
    const check = ready().check(form({ size: '0.1' }));
    if (!check.ok) throw new Error(check.error.message);
    expect(check.value.violations.map((v) => v.rule)).toEqual(['no_stop']);
    await act(async () => {
      expect(await ready().place(check.value)).toBe(true);
    });
    await act(async () => ready().next(1));
    await waitFor(() => expect(ready().view.positions).toHaveLength(1));
    const id = ready().view.positions[0]!.id;
    expect(ready().view.marginUsed.gt(0)).toBe(true);
    await act(async () => {
      expect(await ready().close(id, dec('0.05'))).toBe(true);
    });
    await act(async () => {
      expect(await ready().close(id, null)).toBe(true);
    });
    await waitFor(() => expect(ready().view.history).toHaveLength(2));
    const journal = await harness.container.journal.list({ source: 'paper' });
    if (!journal.ok) throw new Error(journal.error.message);
    expect(journal.value).toHaveLength(2);
    expect(journal.value[0]).toMatchObject({ source: 'paper', instrument: fx.symbol, ruleViolations: ['no_stop'], stop: null, equityAtEntry: '10000' });
    expect(journal.value[0]!.processScore).toBeLessThan(1);

    await act(async () => {
      expect(await ready().close(id, null)).toBe(false);
    });
    expect(ready().error).toMatch(/already closed/);
    await act(async () => ready().reset());
    await waitFor(() => expect(ready().account.resets).toBe(1));
    expect(ready().view.history).toEqual([]);
    expect(ready().view.balance.toString()).toBe('10000');
  });

  it('records removing or widening a stop as a rule break, but not tightening it', async () => {
    expect(stopWidened('buy', dec('1.09'), null)).toBe(true);
    expect(stopWidened('buy', dec('1.09'), dec('1.08'))).toBe(true);
    expect(stopWidened('buy', dec('1.09'), dec('1.095'))).toBe(false);
    expect(stopWidened('sell', dec('1.09'), dec('1.10'))).toBe(true);
    expect(stopWidened('sell', null, dec('1.10'))).toBe(false);

    const created = await renderHook(() => useCreatePaperAccount(), { wrapper });
    const account = await created.result.current({ name: 'FX', instrumentId: 'sim-eurusd', scenarioKind: 'range', timeframe: 'H1', balance: '10000' });
    if (!account.ok) throw new Error(account.error.message);
    const { result } = await renderHook(() => usePaperSession(account.value.id), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const ready = () => {
      if (result.current.status !== 'ready') throw new Error('not ready');
      return result.current;
    };
    const stop = mid().minus('0.0050').toString();
    const check = ready().check(form({ size: '0.1', stopLoss: stop }));
    if (!check.ok) throw new Error(check.error.message);
    expect(check.value.violations).toEqual([]);
    await act(async () => {
      await ready().place(check.value);
    });
    await act(async () => ready().next(1));
    await waitFor(() => expect(ready().view.positions).toHaveLength(1));
    const id = ready().view.positions[0]!.id;
    await act(async () => {
      expect(await ready().edit(id, null, null)).toBe(true);
    });
    await waitFor(() => expect(ready().view.events).toEqual(['Stop moved to risk more: recorded as a rule break']));
    await act(async () => {
      await ready().close(id, null);
    });
    await waitFor(async () => {
      const journal = await harness.container.journal.list({ source: 'paper' });
      expect(journal.ok && journal.value.map((e) => e.ruleViolations)).toEqual([['stop_moved_away']]);
    });
  });

  it('journals closed trades again on load if the earlier write was lost', async () => {
    const created = await renderHook(() => useCreatePaperAccount(), { wrapper });
    const account = await created.result.current({ name: 'FX', instrumentId: 'sim-eurusd', scenarioKind: 'range', timeframe: 'H1', balance: '10000' });
    if (!account.ok) throw new Error(account.error.message);
    const first = await renderHook(() => usePaperSession(account.value.id), { wrapper });
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    const s = () => first.result.current as Extract<typeof first.result.current, { status: 'ready' }>;
    const check = s().check(form({ size: '0.1', stopLoss: mid().minus('0.0050').toString() }));
    if (!check.ok) throw new Error(check.error.message);
    await act(async () => {
      await s().place(check.value);
    });
    await act(async () => s().next(1));
    await waitFor(() => expect(s().view.positions).toHaveLength(1));
    await act(async () => {
      await s().close(s().view.positions[0]!.id, null);
    });
    const listed = await harness.container.journal.list({ source: 'paper' });
    if (!listed.ok) throw new Error(listed.error.message);
    // Simulate the lost write, then open the account again.
    await harness.container.journal.remove(listed.value[0]!.id);
    await first.unmount();
    await renderHook(() => usePaperSession(account.value.id), { wrapper });
    await waitFor(async () => {
      const again = await harness.container.journal.list({ source: 'paper' });
      expect(again.ok && again.value).toHaveLength(1);
    });
  });

  it('deletes an account and keeps its journal entries', async () => {
    const created = await renderHook(() => useCreatePaperAccount(), { wrapper });
    const account = await created.result.current({ name: 'FX', instrumentId: 'sim-eurusd', scenarioKind: 'range', timeframe: 'H1', balance: '10000' });
    if (!account.ok) throw new Error(account.error.message);
    const { result } = await renderHook(() => usePaperSession(account.value.id), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      expect(await (result.current as Extract<typeof result.current, { status: 'ready' }>).remove()).toBe(true);
    });
    const list = await harness.container.paper.list();
    expect(list.ok && list.value).toEqual([]);
  });

  it('reports a missing account', async () => {
    const { result } = await renderHook(() => usePaperSession('nope'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
