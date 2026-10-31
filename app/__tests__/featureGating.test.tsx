import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { gatedScreenLayout, RouteGate } from '../../components/navigation/RouteGate';
import { featureFlags } from '../../shared/featureFlags';
import { featuresForRoute, ROUTE_FEATURES } from '../../shared/routeAccess';
import { resetFeatureFlags, turnFeaturesOff } from '../../testing/featureFlagSeam';
import { resetRouterMock, routerMock } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import TabLayout from '../(tabs)/_layout';
import CalculatorsScreen from '../(tabs)/learn/calculators';
import LabsScreen from '../labs/index';

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual<typeof import('react-native')>('react-native');
  const base = jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule();
  const Tabs = Object.assign(({ children }: { children: ReactElement }) => children, {
    Screen: ({ name, options }: { name: string; options: { href?: null; tabBarButtonTestID?: string } }) => (
      <T testID={options.tabBarButtonTestID}>{`tab:${name}:${options.href === null ? 'hidden' : 'shown'}`}</T>
    ),
  });
  return { ...base, Tabs };
});
jest.mock('../../shared/featureFlags', () =>
  jest.requireActual<typeof import('../../testing/featureFlagSeam')>('../../testing/featureFlagSeam').createFeatureFlagsModule(),
);


let harness: TestHarness;
beforeEach(() => resetRouterMock());
afterEach(() => resetFeatureFlags());

/** One database for a describe block; screens that write to it get a fresh one per test. */
function useHarness(scope: 'all' | 'each') {
  const [before, after] = scope === 'all' ? [beforeAll, afterAll] : [beforeEach, afterEach];
  before(async () => {
    harness = await createTestHarness();
  });
  after(() => harness.db.close());
}

/** Flags that gate at least one route. */
const ROUTE_FLAGS = [...new Set(Object.values(ROUTE_FEATURES).flat())].sort();

describe('route gate', () => {
  useHarness('all');
  it('every gated flag is on today, so the shipped values are kept', () => {
    for (const f of ROUTE_FLAGS) expect(featureFlags[f]).toBe(true);
  });

  it.each(ROUTE_FLAGS)('with %s off, each of its routes shows "not available" with a way home', async (flag) => {
    turnFeaturesOff(flag);
    const routes = Object.keys(ROUTE_FEATURES).filter((r) => (featuresForRoute(r) ?? []).includes(flag));
    expect(routes.length).toBeGreaterThan(0);
    await render(
      <TestProviders container={harness.container}>
        {routes.map((route) => (
          <RouteGate key={route} path={route}>
            <Text>{`secret ${route}`}</Text>
          </RouteGate>
        ))}
      </TestProviders>,
    );
    expect(screen.getAllByText('Not available')).toHaveLength(routes.length);
    expect(screen.queryByText(/^secret/)).toBeNull();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Go to Home' })[0]!);
    expect(routerMock.replace).toHaveBeenCalledWith('/home');
  });

  it('a deep link resolves through the navigator layout, which uses the same gate', async () => {
    const MoreScreenLayout = gatedScreenLayout('/more');
    const RootScreenLayout = gatedScreenLayout('');
    turnFeaturesOff('tradingPlan', 'backtesting');
    await render(
      <TestProviders container={harness.container}>
        <MoreScreenLayout route={{ name: 'plan/index' }}>
          <Text>plan screen</Text>
        </MoreScreenLayout>
        <MoreScreenLayout route={{ name: 'settings' }}>
          <Text>settings screen</Text>
        </MoreScreenLayout>
        <RootScreenLayout route={{ name: 'backtest/result/[id]' }}>
          <Text>report screen</Text>
        </RootScreenLayout>
        <RootScreenLayout route={{ name: '(tabs)' }}>
          <Text>tabs</Text>
        </RootScreenLayout>
      </TestProviders>,
    );
    expect(screen.queryByText('plan screen')).toBeNull();
    expect(screen.queryByText('report screen')).toBeNull();
    expect(screen.getByText('settings screen')).toBeTruthy();
    expect(screen.getByText('tabs')).toBeTruthy();
    expect(screen.getAllByText('Not available')).toHaveLength(2);
  });

  it('a tab whose feature is off is hidden from the tab bar', async () => {
    turnFeaturesOff('strategies', 'journal');
    await render(
      <TestProviders container={harness.container}>
        <TabLayout />
      </TestProviders>,
    );
    expect(screen.getByText('tab:strategies:hidden')).toBeTruthy();
    expect(screen.getByText('tab:journal:hidden')).toBeTruthy();
    expect(screen.getByText('tab:learn:shown')).toBeTruthy();
    expect(screen.getByText('tab:home:shown')).toBeTruthy();
    // Maestro taps tabs by these ids.
    expect(screen.getByTestId('tab-home')).toBeTruthy();
    expect(screen.getByTestId('tab-more')).toBeTruthy();
  });
});

describe('the futures calculator flag', () => {
  useHarness('all');
  it('hides the calculator and the labs row', async () => {
    turnFeaturesOff('futuresCalculator');
    await render(
      <TestProviders container={harness.container}>
        <CalculatorsScreen />
      </TestProviders>,
    );
    expect(screen.queryByRole('radio', { name: /Futures/ })).toBeNull();
    await render(
      <TestProviders container={harness.container}>
        <LabsScreen />
      </TestProviders>,
    );
    expect(screen.queryByTestId('labs-futures-calculator')).toBeNull();
  });
});

describe('service settings follow their features', () => {
  useHarness('all');

  it('hides the price-data and coach sections when those features are off', async () => {
    const ServicesScreen = jest.requireActual<{ default: () => ReactElement }>('../(tabs)/more/services').default;
    turnFeaturesOff('marketData', 'coach');
    await render(
      <TestProviders container={harness.container}>
        <ServicesScreen />
      </TestProviders>,
    );
    expect(await screen.findByText('Everything works offline')).toBeTruthy();
    expect(screen.queryByText('Price data: Twelve Data')).toBeNull();
    expect(screen.queryByRole('header', { name: 'Coach' })).toBeNull();
  });
});
