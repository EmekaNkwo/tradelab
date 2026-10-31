/**
 * Test-only (Node): reads the Expo Router route files under app/ and the route strings the code navigates to,
 * so tests can check that every link goes somewhere real and every route has a feature decision.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..');

function walk(dir: string, accept: (file: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === '__tests__' || name === 'node_modules' || name === 'generated') return [];
    if (statSync(full).isDirectory()) return walk(full, accept);
    return accept(full) ? [full] : [];
  });
}

/** `app/(tabs)/more/plan/index.tsx` → `/more/plan`; `app/labs/concept/[id].tsx` → `/labs/concept/[id]`. */
export function routePathFromFile(file: string): string {
  const rel = relative(join(ROOT, 'app'), file).split(sep).join('/').replace(/\.tsx?$/, '');
  const segments = rel.split('/').filter((s) => !/^\(.*\)$/.test(s));
  if (segments[segments.length - 1] === 'index') segments.pop();
  return `/${segments.join('/')}`;
}

/** Every screen route in app/ (layouts excluded), as URL paths with dynamic segments kept as `[name]`. */
export function appRoutes(): string[] {
  return walk(join(ROOT, 'app'), (f) => /\.tsx?$/.test(f) && !/(^|[\\/])_layout\.tsx?$/.test(f) && !/[\\/]\+/.test(f))
    .map(routePathFromFile)
    .sort();
}

export interface RouteReference {
  readonly file: string;
  readonly line: number;
  readonly route: string;
}

/** Literal route strings: `'/x/y'`, `"/x"`, and template literals such as `` `/class/${id}` `` (the `${…}` becomes `[param]`). */
const ROUTE_LITERAL = /(['"`])(\/(?:[a-z0-9\-[\]()]+|\$\{[^}]+\})?(?:\/(?:[a-z0-9\-[\]()]+|\$\{[^}]+\}))*)\1/g;

const ROUTE_CUE = /router\.|href|pathname|Redirect|Href|navigate|canOpen\(/;

/**
 * Every route string used by navigation code in app/, components/ and features/: lines that call the router,
 * set an href/pathname, render a Redirect, gate with canOpen, return a route, or hold one as an object or
 * ternary value.
 *
 * Blind spots (a line-based scan cannot see them; app/__tests__/computedRoutes.test.tsx covers the known ones):
 * - routes built from data at run time, e.g. `'/' + tab.name` or `` `/${kind}` `` — the tab names, the More menu
 *   items, the practice-tool and study-link maps are checked there by importing the values;
 * - a route string split across lines, or passed through a variable defined on a line with none of the cues above;
 * - query strings and params are not checked, only the path.
 */
export function routeReferences(): RouteReference[] {
  const files = ['app', 'components', 'features'].flatMap((d) => walk(join(ROOT, d), (f) => /\.tsx?$/.test(f)));
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((text, index) => {
        if (!ROUTE_CUE.test(text) && !/^\s*['"`]\/[a-z]/.test(text) && !/(?:[?:]|return)\s*['"`]\/[a-z]/.test(text)) return [];
        return [...text.matchAll(ROUTE_LITERAL)].map((m) => ({
          file: relative(ROOT, file),
          line: index + 1,
          route: (m[2] ?? '').replace(/\$\{[^}]+\}/g, '[param]'),
        }));
      }),
  );
}

function segmentsOf(path: string): string[] {
  return path.split('?')[0]!.split('/').filter((s) => s.length > 0 && !/^\(.*\)$/.test(s));
}

const isDynamic = (segment: string) => /^\[.+\]$/.test(segment);

/** True when `target` (a concrete path or a pathname with `[param]` segments) resolves to `route`. */
export function routeMatches(target: string, route: string): boolean {
  const t = segmentsOf(target);
  const r = segmentsOf(route);
  if (t.length !== r.length) return false;
  return r.every((segment, i) => {
    const want = t[i]!;
    if (isDynamic(segment)) return true;
    return segment === want;
  });
}

/** The route file a target resolves to, preferring static segments over dynamic ones (as Expo Router does). */
export function resolveRoute(target: string, routes: readonly string[] = appRoutes()): string | null {
  const matches = routes.filter((r) => routeMatches(target, r));
  if (matches.length === 0) return null;
  const staticCount = (r: string) => segmentsOf(r).filter((s) => !isDynamic(s)).length;
  return [...matches].sort((a, b) => staticCount(b) - staticCount(a))[0] ?? null;
}
