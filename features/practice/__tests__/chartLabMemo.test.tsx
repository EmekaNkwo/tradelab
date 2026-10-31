import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { generateScenario } from '../../../domain/market';
import { createTestHarness, TestProviders, type TestHarness } from '../../../testing/testContainer';
import { useChartLab, type RealChartData } from '../useChartLab';

/**
 * Phase 12 performance: the Chart Lab screen builds the real-data object
 * inline, so it is a new object on every render. The candles (and so the
 * indicators memoised on them) must only change when the data does.
 */

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
});
afterEach(() => harness.db.close());

const wrapper = ({ children }: { children: ReactNode }) => <TestProviders container={harness.container}>{children}</TestProviders>;
const CANDLES = generateScenario({ kind: 'range', seed: 4, timeframe: 'H1', count: 600 }).candles;

describe('useChartLab memoising', () => {
  it('keeps the same candles when re-rendered with an equal real-data object', async () => {
    const make = (): RealChartData => ({ label: 'Imported: test.csv', timeframe: 'H1', candles: CANDLES });
    const { result, rerender } = await renderHook(({ real }: { real: RealChartData }) => useChartLab(null, real), { wrapper, initialProps: { real: make() } });
    const first = result.current.candles;
    expect(first).toHaveLength(240);
    await rerender({ real: make() });
    expect(result.current.candles).toBe(first);
  });
});
