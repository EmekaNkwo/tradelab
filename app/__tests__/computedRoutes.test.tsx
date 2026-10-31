import { LINK_ROUTES } from '../../components/calendar/StudyLinks';
import { TOOL_ROUTES } from '../../components/learning/PracticeCard';
import { MORE_APP, MORE_RESEARCH, MORE_TOOLS, TABS } from '../../components/navigation/menus';
import { featuresForRoute } from '../../shared/routeAccess';
import { appRoutes, resolveRoute } from '../../testing/appRoutes';

/** Routes the line scanner in testing/appRoutes.ts cannot see, because they are built from data (spec §38). */
describe('computed route sources', () => {
  const routes = appRoutes();
  const sources: readonly (readonly [string, string])[] = [
    ...TABS.map((t) => [`tab ${t.name}`, `/${t.name}`] as const),
    ...[...MORE_TOOLS, ...MORE_APP, MORE_RESEARCH].map((i) => [`More: ${i.title}`, i.href] as const),
    ...Object.entries(TOOL_ROUTES).map(([kind, r]) => [`practice tool ${kind}`, r] as const),
    ...Object.entries(LINK_ROUTES).map(([kind, r]) => [`study link ${kind}`, r] as const),
  ];

  it('has the sources it is meant to check', () => {
    expect(TABS).toHaveLength(6);
    expect(MORE_TOOLS.length + MORE_APP.length).toBeGreaterThan(5);
    expect(Object.keys(TOOL_ROUTES).length).toBeGreaterThan(3);
  });

  it.each(sources)('%s → %s resolves to a route file and has a feature decision', (_what, route) => {
    expect(resolveRoute(route, routes)).not.toBeNull();
    expect(featuresForRoute(route)).not.toBeNull();
  });
});
