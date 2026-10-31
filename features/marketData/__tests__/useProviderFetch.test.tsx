import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { ProviderSeries } from '../../../data';
import type { AppError } from '../../../shared/errors';
import { ok, type Result } from '../../../shared/result';
import { providerRows } from '../../../testing/fakeOnline';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { useProviderFetch } from '..';

let h: TestHarness;
const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={h.container}>{children}</TestProviders>;
const FORM = { symbol: 'EUR/USD', name: '', market: 'forex' as const, timeframe: 'H1' as const, candles: 200 };

/** Each provider call waits until the test answers it. */
let pending: ((rows: number) => void)[] = [];
beforeEach(async () => {
  h = await createTestHarness();
  pending = [];
  await h.container.secrets.set('twelvedata_api_key', 'td-secret-key-0123456789');
  const s = await h.container.settings.get();
  if (!s.ok) throw new Error(s.error.message);
  await h.container.settings.update({ integrations: { ...s.value.integrations, marketProvider: true } }, '2026-10-30T10:00:00.000Z' as never);
  h.provider.fetchSeries = (req) => {
    h.provider.requests.push(req);
    return new Promise<Result<ProviderSeries, AppError>>((resolve) =>
      pending.push((rows) => resolve(ok({ symbol: 'EUR/USD', currency: 'USD', exchange: null, exchangeTimeZone: null, instrumentType: null, rowsTimeZone: 'UTC', rows: providerRows(rows) }))),
    );
  };
});
afterEach(() => h.db.close());

describe('useProviderFetch races (C)', () => {
  it('starts one request when Fetch is pressed twice quickly', async () => {
    const { result } = await renderHook(() => useProviderFetch(), { wrapper });
    await act(async () => {
      void result.current.start(FORM);
      void result.current.start(FORM);
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(h.provider.requests).toHaveLength(1);
    await act(async () => pending[0]?.(200));
    await waitFor(() => expect(result.current.state.status).toBe('done'));
  });

  it('ignores a cancelled fetch’s late result, and a restart is not cut short by it', async () => {
    const { result } = await renderHook(() => useProviderFetch(), { wrapper });
    await act(async () => void result.current.start(FORM));
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => result.current.cancel());
    await act(async () => void result.current.start({ ...FORM, candles: 300 }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[0]?.(200));
    expect(result.current.state.status).toBe('fetching');
    // A third press while the restart runs is still refused: the stale result did not clear the restart's claim.
    await act(async () => void result.current.start(FORM));
    expect(h.provider.requests).toHaveLength(2);
    await act(async () => pending[1]?.(300));
    await waitFor(() => expect(result.current.state.status).toBe('done'));
    const s = result.current.state;
    expect(s.status === 'done' && s.outcome.dataset.candleCount).toBe(300);
  });
});
