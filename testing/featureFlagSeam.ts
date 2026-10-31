/**
 * Test-only seam for feature flags. In a test file:
 *
 *   jest.mock('../../shared/featureFlags', () =>
 *     jest.requireActual<typeof import('../../testing/featureFlagSeam')>('../../testing/featureFlagSeam').createFeatureFlagsModule());
 *
 * then `turnFeaturesOff('backtesting')` and `resetFeatureFlags()` in `afterEach`. Flags keep their shipped
 * values unless a test turns one off.
 */
import type { FeatureName } from '../shared/featureFlags';

const off = new Set<FeatureName>();

export function turnFeaturesOff(...names: FeatureName[]): void {
  for (const n of names) off.add(n);
}

export function resetFeatureFlags(): void {
  off.clear();
}

export function createFeatureFlagsModule(): typeof import('../shared/featureFlags') {
  const actual = jest.requireActual<typeof import('../shared/featureFlags')>('../shared/featureFlags');
  return {
    ...actual,
    isFeatureEnabled: (name: FeatureName) => !off.has(name) && actual.isFeatureEnabled(name),
  };
}
