import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { REPLAY_CANDLES, startIndexFor, type ReplaySetup } from '../replaySession';
import { useDrill } from '../useDrill';
import { useReplay } from '../useReplay';

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
});
afterEach(() => {
  jest.useRealTimers();
  harness.db.close();
});

const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={harness.container}>{children}</TestProviders>;
const SETUP: ReplaySetup = { kind: 'range', seed: 11, timeframe: 'H1', balance: '1000' };

describe('useReplay (Phase 4 review)', () => {
  it('stops playing at the last candle and does not resume after stepping back', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => useReplay(SETUP), { wrapper });
    const toReveal = REPLAY_CANDLES - startIndexFor(SETUP.seed);
    await act(async () => result.current.setSpeedMs(250));
    await act(async () => result.current.setPlaying(true));
    expect(result.current.playing).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(250 * (toReveal + 5));
    });
    expect(result.current.view!.finished).toBe(true);
    expect(result.current.playing).toBe(false);
    await act(async () => {
      result.current.back();
    });
    expect(result.current.view!.finished).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.playing).toBe(false);
    expect(result.current.view!.remaining).toBe(1);
  });

  it('saves one record when Finish is tapped twice', async () => {
    const { result } = await renderHook(() => useReplay(SETUP), { wrapper });
    await act(async () => {
      void result.current.finish('');
      void result.current.finish('');
    });
    await waitFor(() => expect(result.current.review).not.toBeNull());
    const saved = await harness.container.practice.replayAttempts();
    expect(saved.ok && saved.value).toHaveLength(1);
  });
});

describe('useDrill (Phase 4 review)', () => {
  it('records one answer when two options are tapped at once, and hides the answer key before that', async () => {
    const { result } = await renderHook(() => useDrill('size_it', 4), { wrapper });
    expect(Object.keys(result.current.question)).toEqual(['kind', 'seed', 'prompt', 'options']);
    expect(result.current.result).toBeNull();
    await act(async () => {
      void result.current.answer('ten_x');
      void result.current.answer('right');
    });
    await waitFor(async () => {
      const saved = await harness.container.practice.drillAttempts();
      expect(saved.ok && saved.value.map((a) => a.optionId)).toEqual(['ten_x']);
    });
    expect(result.current.chosen).toBe('ten_x');
    await act(async () => result.current.another());
    expect(result.current.chosen).toBeNull();
    expect(result.current.question.seed).not.toBe(4);
  });
});
