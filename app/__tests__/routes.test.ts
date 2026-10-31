import { appRoutes, resolveRoute, routeMatches, routeReferences } from '../../testing/appRoutes';

/** No dead navigation (spec §38): every route string in the code resolves to a real Expo Router route file. */
describe('route strings', () => {
  const routes = appRoutes();
  const refs = routeReferences();

  it('finds the route files and the navigation code', () => {
    expect(routes).toContain('/');
    expect(routes).toContain('/more/plan');
    expect(routes).toContain('/labs/concept/[id]');
    // Guards against the scanner silently breaking: the app navigates in well over a hundred places.
    expect(refs.length).toBeGreaterThan(100);
    expect(refs.some((r) => r.route === '/class/[param]')).toBe(true);
  });

  it('matches dynamic segments and prefers static routes', () => {
    expect(routeMatches('/lesson/abc', '/lesson/[id]')).toBe(true);
    expect(routeMatches('/lesson', '/lesson/[id]')).toBe(false);
    expect(resolveRoute('/practice/paper', ['/practice/paper/[id]', '/practice/paper'])).toBe('/practice/paper');
    expect(resolveRoute('/nowhere/at/all', routes)).toBeNull();
  });

  it('every route string used by router.push/replace, Link, Redirect and href resolves to a route file', () => {
    const dead = refs.filter((r) => resolveRoute(r.route, routes) === null).map((r) => `${r.file}:${r.line} → ${r.route}`);
    expect(dead).toEqual([]);
  });
});
