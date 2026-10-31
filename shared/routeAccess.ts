/**
 * Which feature flags each route needs (spec §37.1: nothing unfinished is reachable). Navigators wrap every
 * screen in a gate that reads this map, so a route whose feature is off shows "not available", even from a
 * deep link. Entry points (rows, buttons) check `isRouteEnabled` before rendering.
 *
 * Paths are URL paths with route groups removed and dynamic segments kept, e.g. `/labs/concept/[id]`.
 * A test checks that every route file under `app/` is listed here or in `UNGATED_ROUTES`.
 */
import { isFeatureEnabled, type FeatureName } from './featureFlags';

/** Core routes that are always present: the start redirect, onboarding, Home (where the gate sends the learner) and the More menu. */
export const UNGATED_ROUTES: readonly string[] = ['/', '/onboarding', '/home', '/more'];

const learn: readonly FeatureName[] = ['learn'];
const practice: readonly FeatureName[] = ['practice'];
const paper: readonly FeatureName[] = ['practice', 'paper'];
const journal: readonly FeatureName[] = ['journal'];
const labs: readonly FeatureName[] = ['analysisLabs'];
const backtesting: readonly FeatureName[] = ['backtesting'];
const portfolio: readonly FeatureName[] = ['portfolio'];
const traders: readonly FeatureName[] = ['strategies', 'famousTraders'];
const marketData: readonly FeatureName[] = ['marketData'];
const calendar: readonly FeatureName[] = ['calendar'];
const challenges: readonly FeatureName[] = ['progressDashboard', 'challenges'];

export const ROUTE_FEATURES: Readonly<Record<string, readonly FeatureName[]>> = {
  // The daily class and its spaced review show lessons and quizzes; the timeline screen edits the program.
  '/class/[id]': learn,
  '/review': learn,
  '/home/program': ['learn', 'programs'],
  '/learn': learn,
  '/learn/glossary': learn,
  '/learn/calculators': learn,
  '/learn/metatrader': learn,
  '/learn/programs': ['learn', 'programs'],
  '/lesson/[id]': learn,
  '/glossary/[id]': learn,
  '/mt-task/[id]': learn,
  '/practice': practice,
  '/practice/chart-lab': practice,
  '/practice/replay': practice,
  '/practice/drill': practice,
  '/practice/paper': paper,
  '/practice/paper/[id]': paper,
  '/journal': journal,
  '/journal/new': journal,
  '/journal/import': journal,
  '/journal/stats': journal,
  '/journal/psychology': journal,
  '/journal/entry/[id]': journal,
  '/more/settings': ['settings'],
  '/more/risk-rules': ['riskRules'],
  '/more/plan': ['tradingPlan'],
  '/more/plan/edit': ['tradingPlan'],
  '/more/checklist': ['checklist'],
  '/more/sessions': ['sessions'],
  '/more/broker-check': ['brokerCheck'],
  '/more/progress-review': ['progressReview'],
  '/more/backup': ['backup'],
  '/more/about': ['disclosures'],
  '/more/services': ['services'],
  '/strategies': ['strategies'],
  '/strategy/[id]': ['strategies'],
  '/traders': traders,
  '/trader/[id]': traders,
  '/research': ['researchLibrary'],
  '/labs': labs,
  '/labs/concepts/[lab]': labs,
  '/labs/concept/[id]': labs,
  '/labs/companies': labs,
  '/labs/company/[id]': labs,
  '/labs/red-flags': labs,
  '/labs/red-flag/[id]': labs,
  '/labs/scenarios': labs,
  '/labs/scenario/[id]': labs,
  '/labs/markets': labs,
  '/backtest': backtesting,
  '/backtest/builder': backtesting,
  '/backtest/strategy/[id]': backtesting,
  '/backtest/run': backtesting,
  '/backtest/result/[id]': backtesting,
  '/backtest/compare': backtesting,
  '/backtest/playbook/[id]': backtesting,
  '/portfolio': portfolio,
  '/portfolio/sandbox': portfolio,
  '/progress': ['progressDashboard'],
  '/progress/skill/[id]': ['progressDashboard'],
  '/progress/challenges': challenges,
  '/progress/challenge/[id]': challenges,
  '/data': marketData,
  '/data/import': marketData,
  '/data/[id]': marketData,
  '/calendar': calendar,
  '/calendar/[id]': calendar,
  '/news': ['newsToLearning'],
  '/coach': ['coach'],
  // Dev builds only (flag is `__DEV__`): every shared component in light and dark.
  '/dev/gallery': ['componentGallery'],
};

const segmentsOf = (path: string): string[] =>
  (path.split('?')[0] ?? '').split('/').filter((s) => s.length > 0 && !/^\(.*\)$/.test(s));

const isDynamic = (segment: string) => /^\[.+\]$/.test(segment);

/** A navigator's route name (`plan/index`, `labs/concept/[id]`) under its base path (`/more`, ``) → URL path. */
export function routePathFromName(base: string, name: string): string {
  const segments = [...segmentsOf(base), ...segmentsOf(name)];
  const trimmed = segments[segments.length - 1] === 'index' ? segments.slice(0, -1) : segments;
  return `/${trimmed.join('/')}`;
}

function findRoute(path: string): string | null {
  const target = segmentsOf(path);
  const key = `/${target.join('/')}`;
  if (key in ROUTE_FEATURES || UNGATED_ROUTES.includes(key)) return key;
  const candidates = [...Object.keys(ROUTE_FEATURES), ...UNGATED_ROUTES].filter((route) => {
    const r = segmentsOf(route);
    return r.length === target.length && r.every((s, i) => isDynamic(s) || s === target[i]);
  });
  const staticCount = (route: string) => segmentsOf(route).filter((s) => !isDynamic(s)).length;
  return [...candidates].sort((a, b) => staticCount(b) - staticCount(a))[0] ?? null;
}

/**
 * The features a path needs: empty for core routes, and `null` for a path the map does not know. Unknown paths
 * fail closed, so a route added without a decision is never reachable by accident.
 */
export function featuresForRoute(path: string): readonly FeatureName[] | null {
  const route = findRoute(path);
  if (route === null) return null;
  return ROUTE_FEATURES[route] ?? [];
}

/** True when the path is known and every feature it needs is on. `enabled` is injectable for tests. */
export function isRouteEnabled(path: string, enabled: (name: FeatureName) => boolean = isFeatureEnabled): boolean {
  const features = featuresForRoute(path);
  return features !== null && features.every(enabled);
}

/** A route string or an Expo Router `{ pathname, params }` object. */
export type RouteTarget = string | { readonly pathname: string };

/** Entry points (rows, buttons, links) render only when `canOpen(target)` is true. */
export function canOpen(target: RouteTarget): boolean {
  return isRouteEnabled(typeof target === 'string' ? target : target.pathname);
}
