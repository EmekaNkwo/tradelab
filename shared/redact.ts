/**
 * Removes secrets from text before it is logged or shown (spec §34: API keys
 * never in logs). Keys the learner saved are registered at runtime, so even
 * a key with an unfamiliar shape is masked; well-known key shapes and
 * credential headers are masked as well.
 */
export const REDACTED = '[redacted]';

const KEY_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /\b(apikey|api[_-\s]?key|x-api-key|authorization|bearer|token)(["'\s:=]+)([A-Za-z0-9._~+/=-]{8,})/gi,
  // A bare `key=` query or form field with a long token.
  /\b(key)(=)([A-Za-z0-9._~+/-]{16,})/gi,
];

let known: readonly string[] = [];

/** Masks this exact value wherever it appears from now on. Very short values are ignored (they would mask ordinary text). */
export function registerSecret(value: string): void {
  const v = value.trim();
  if (v.length < 8 || known.includes(v)) return;
  known = [...known, v];
}

export function forgetSecret(value: string): void {
  known = known.filter((k) => k !== value.trim());
}

export function redactText(text: string): string {
  let out = text;
  for (const secret of known) out = out.split(secret).join(REDACTED);
  out = out.replace(KEY_PATTERNS[0] as RegExp, REDACTED);
  for (const pattern of KEY_PATTERNS.slice(1)) out = out.replace(pattern, (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`);
  return out;
}

/** A deep copy of a log context with every string redacted and secret-named fields dropped. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactText(value);
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, /key|secret|token|authorization|password/i.test(k) ? REDACTED : redactValue(v, depth + 1)]),
  );
}
