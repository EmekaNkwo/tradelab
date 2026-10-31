import type { StrategyDefinition } from './model';

/** One setting that differs between two versions of a strategy. */
export interface DefinitionChange {
  /** Dotted path, e.g. `stop.multiple` or `longEntry.conditions.0.right.period`. */
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) out.set(path, Array.isArray(value) ? '(none)' : '(empty)');
    for (const [k, v] of entries) flatten(v, path ? `${path}.${k}` : k, out);
    return;
  }
  out.set(path, value === null || value === undefined ? '(none)' : String(value));
}

/** Every setting that changed from `before` to `after`, so a new version never hides what changed (spec §16.2, §16.5). */
export function definitionChanges(before: StrategyDefinition, after: StrategyDefinition): readonly DefinitionChange[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  flatten(before, '', a);
  flatten(after, '', b);
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const at = (m: Map<string, string>, p: string) => m.get(p) ?? '(none)';
  return paths.filter((p) => at(a, p) !== at(b, p)).map((p) => ({ path: p, before: at(a, p), after: at(b, p) }));
}
