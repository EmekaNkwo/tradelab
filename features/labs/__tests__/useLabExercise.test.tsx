import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { storageError } from '../../../shared/errors';
import { err } from '../../../shared/result';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { useLabExercise } from '../useLabs';

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
});
afterEach(() => {
  jest.restoreAllMocks();
  harness.db.close();
});

const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={harness.container}>{children}</TestProviders>;
const OPTIONS = [
  { id: 'a', expected: true },
  { id: 'b', expected: false },
];

describe('useLabExercise (Phase 7 review)', () => {
  it('still shows the marking when saving fails, and reports the error', async () => {
    jest.spyOn(harness.container.labs, 'record').mockResolvedValue(err(storageError('disk full')));
    const { result } = await renderHook(() => useLabExercise('red_flag', 'case-a', OPTIONS), { wrapper });
    await act(async () => result.current.toggle('a'));
    await act(async () => result.current.check());
    expect(result.current.mark?.score).toBe(1);
    expect(result.current.error?.kind).toBe('StorageError');
    expect(result.current.saving).toBe(false);
  });

  it('saves one attempt when Check is pressed twice', async () => {
    const { result } = await renderHook(() => useLabExercise('scenario', 'scn-a', OPTIONS), { wrapper });
    await act(async () => {
      await Promise.all([result.current.check(), result.current.check()]);
    });
    const saved = await harness.container.labs.attempts();
    expect(saved.ok && saved.value).toHaveLength(1);
    // Picking nothing is a real answer: "b" was rightly left, "a" was missed.
    expect(saved.ok && saved.value[0]?.score).toBe(0.5);
  });

  it('ignores picks after checking and clears everything on reset', async () => {
    const { result } = await renderHook(() => useLabExercise('scenario', 'scn-a', OPTIONS), { wrapper });
    await act(async () => result.current.check());
    await act(async () => result.current.toggle('a'));
    expect(result.current.picked).toEqual([]);
    await act(async () => result.current.reset());
    expect(result.current.mark).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
