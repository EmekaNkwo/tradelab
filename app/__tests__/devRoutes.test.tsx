import { render, screen } from '@testing-library/react-native';
import { RouteGate } from '../../components/navigation/RouteGate';
import GalleryScreen from '../dev/gallery';
import { resetFeatureFlags, turnFeaturesOff } from '../../testing/featureFlagSeam';
import { ThemeProvider } from '../../theme';

jest.mock('../../shared/featureFlags', () => jest.requireActual<typeof import('../../testing/featureFlagSeam')>('../../testing/featureFlagSeam').createFeatureFlagsModule());

/** The component gallery is reachable in development builds only: release builds (`__DEV__` false) fail closed. */
describe('dev-only routes', () => {
  const g = globalThis as { __DEV__?: boolean };
  const original = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = original;
    resetFeatureFlags();
  });

  /** Loads the flag and route modules fresh, as a build with this `__DEV__` value would. */
  function routeAccessWithDev(dev: boolean) {
    let loaded: { enabled: (path: string) => boolean; flag: boolean } | undefined;
    jest.isolateModules(() => {
      g.__DEV__ = dev;
      const { isRouteEnabled } = jest.requireActual<typeof import('../../shared/routeAccess')>('../../shared/routeAccess');
      const { featureFlags } = jest.requireActual<typeof import('../../shared/featureFlags')>('../../shared/featureFlags');
      // The shipped flag values of that build (this file mocks the flags module for the gate test below).
      loaded = { enabled: (path) => isRouteEnabled(path, (name) => featureFlags[name]), flag: featureFlags.componentGallery };
    });
    return loaded!;
  }

  it('is open in development builds', () => {
    const dev = routeAccessWithDev(true);
    expect(dev.flag).toBe(true);
    expect(dev.enabled('/dev/gallery')).toBe(true);
  });

  it('is closed in release builds, deep links with a query included', () => {
    const release = routeAccessWithDev(false);
    expect(release.flag).toBe(false);
    expect(release.enabled('/dev/gallery')).toBe(false);
    expect(release.enabled('/dev/gallery?x=1')).toBe(false);
    // Nothing else changes with __DEV__.
    expect(release.enabled('/home')).toBe(true);
  });

  it('with the flag off (as in release) the gate shows "Not available" instead of the gallery', async () => {
    turnFeaturesOff('componentGallery');
    await render(
      <ThemeProvider preference="light">
        <RouteGate path="/dev/gallery">
          <GalleryScreen />
        </RouteGate>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('feature-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('component-gallery')).toBeNull();
  });

  it('the screen itself renders nothing when __DEV__ is false', async () => {
    g.__DEV__ = false;
    const view = await render(<GalleryScreen />);
    expect(view.toJSON()).toBeNull();
  });
});
