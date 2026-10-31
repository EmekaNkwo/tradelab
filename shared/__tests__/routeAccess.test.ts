import { appRoutes } from '../../testing/appRoutes';
import { featureFlags, type FeatureName } from '../featureFlags';
import { featuresForRoute, isRouteEnabled, ROUTE_FEATURES, routePathFromName, UNGATED_ROUTES } from '../routeAccess';

describe('route access map', () => {
  const routes = appRoutes();

  it('every route file has a decision: gated by a feature, or explicitly core', () => {
    const undecided = routes.filter((r) => !(r in ROUTE_FEATURES) && !UNGATED_ROUTES.includes(r));
    expect(undecided).toEqual([]);
  });

  it('names only real routes and real flags', () => {
    expect(Object.keys(ROUTE_FEATURES).filter((r) => !routes.includes(r))).toEqual([]);
    expect(UNGATED_ROUTES.filter((r) => !routes.includes(r))).toEqual([]);
    const flags = Object.keys(featureFlags);
    for (const features of Object.values(ROUTE_FEATURES)) for (const f of features) expect(flags).toContain(f);
  });

  it('every flag that is on today keeps its routes open (current values kept)', () => {
    const open = routes.filter((r) => !isRouteEnabled(r));
    expect(open).toEqual([]);
  });

  it('resolves concrete paths, query strings and navigator-relative names', () => {
    expect(featuresForRoute('/labs/concept/trend-basics')).toEqual(['analysisLabs']);
    expect(featuresForRoute('/backtest/result/abc?x=1')).toEqual(['backtesting']);
    expect(featuresForRoute('/traders')).toEqual(['strategies', 'famousTraders']);
    expect(featuresForRoute('/onboarding')).toEqual([]);
    expect(featuresForRoute('/class/c1')).toEqual(['learn']);
    expect(featuresForRoute('/home/program')).toEqual(['learn', 'programs']);
    expect(routePathFromName('/more', 'plan/index')).toBe('/more/plan');
    expect(routePathFromName('', 'labs/concept/[id]')).toBe('/labs/concept/[id]');
    expect(routePathFromName('', 'index')).toBe('/');
  });

  it('closes a route when any of its features is off', () => {
    const off = new Set<FeatureName>(['famousTraders']);
    const enabled = (f: FeatureName) => !off.has(f);
    expect(isRouteEnabled('/traders', enabled)).toBe(false);
    expect(isRouteEnabled('/trader/x', enabled)).toBe(false);
    expect(isRouteEnabled('/strategy/x', enabled)).toBe(true);
  });

  it('fails closed: a path the map does not know is never enabled', () => {
    expect(featuresForRoute('/no-such-screen')).toBeNull();
    expect(isRouteEnabled('/no-such-screen')).toBe(false);
    expect(isRouteEnabled('/labs/concept/x/extra')).toBe(false);
    expect(isRouteEnabled('/home')).toBe(true);
  });
});
