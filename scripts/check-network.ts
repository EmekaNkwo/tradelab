/*
 * Fails if any app module outside the approved network client calls the
 * network (spec §32A.6). Only optional integrations may go online, and only
 * through integrations/http/. Inside it, every host named in code must be in
 * APPROVED_HOSTS below (with the reason it is needed), and the runtime
 * allow-list in integrations/http/allowedHosts.ts must list exactly the same
 * hosts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './lib/readContent';

export const APP_DIRS = ['app', 'components', 'features', 'domain', 'data', 'integrations', 'shared', 'theme', 'di', 'workers', 'plugins', 'scripts', 'testing'];
export const ALLOWED_PREFIXES = ['integrations/http/'];
/** These files name the patterns they forbid (this script, and the matching ESLint rule), so they are not scanned. */
const PATTERN_FILES = ['scripts/check-network.ts', 'eslint.config.js'];

/** Matched against code with comments removed and string contents blanked. */
export const CODE_PATTERNS: readonly RegExp[] = [
  // Any use of the global, not only a call: `const f = fetch`, `globalThis.fetch`.
  // Prose in JSX text ("you fetch that data") has a word on both sides and is not code.
  /(?<![\w$])(?<![A-Za-z] )fetch(?![\w$])|(?<![\w$])fetch(?![\w$])(?! [A-Za-z])/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bnavigator\s*\.\s*sendBeacon\b/,
];

/** Matched against each string literal's value, so `require(...)`, `import(...)` and `globalThis['fetch']` are caught too. */
export const STRING_PATTERNS: readonly RegExp[] = [
  /^fetch$/,
  /^(axios|ky|got|node-fetch|undici|expo-fetch|expo\/fetch|react-native-webview)(\/|$)/,
  // Network SDKs count as network access too.
  /^@anthropic-ai\/sdk(\/|$)/,
  /^wss?:/i,
];

/** Not allowed anywhere, including integrations/http: a client must never be pointed at another host. */
export const EVERYWHERE_PATTERNS: readonly RegExp[] = [/\bbaseURL\b/];

/** Kept for callers that only want the list of everything checked. */
export const NETWORK_PATTERNS: readonly RegExp[] = [...CODE_PATTERNS, ...STRING_PATTERNS, ...EVERYWHERE_PATTERNS];

interface Scanned {
  /** The source with comments removed and string contents replaced by spaces; line breaks are kept. */
  readonly code: string;
  readonly strings: readonly { readonly value: string; readonly line: number }[];
}

/** A small lexer: enough to tell code from comments and strings, not a parser. */
export function scanSource(text: string): Scanned {
  let code = '';
  const strings: { value: string; line: number }[] = [];
  let line = 1;
  let i = 0;
  const keep = (ch: string) => {
    code += ch === '\n' ? '\n' : ch;
    if (ch === '\n') line += 1;
  };
  while (i < text.length) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') keep('\n');
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const startLine = line;
      let value = '';
      code += ' ';
      i += 1;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\') {
          value += text[i + 1] ?? '';
          code += '  ';
          i += 2;
          continue;
        }
        // A template's ${...} is code; its text around it is not.
        if (ch === '`' && text[i] === '$' && text[i + 1] === '{') {
          let depth = 1;
          code += '${';
          i += 2;
          while (i < text.length && depth > 0) {
            if (text[i] === '{') depth += 1;
            if (text[i] === '}') depth -= 1;
            if (depth > 0) keep(text[i] as string);
            i += 1;
          }
          code += '}';
          continue;
        }
        if (ch !== '`' && text[i] === '\n') break;
        value += text[i];
        if (text[i] === '\n') keep('\n');
        else code += ' ';
        i += 1;
      }
      code += ' ';
      i += 1;
      strings.push({ value, line: startLine });
      continue;
    }
    keep(ch);
    i += 1;
  }
  return { code, strings };
}

function violationsIn(rel: string, text: string, allowed: boolean): string[] {
  const { code, strings } = scanSource(text);
  const lines = text.split('\n');
  const at = (n: number) => `${rel}:${n}: ${(lines[n - 1] ?? '').trim()}`;
  const codeHits = code.split('\n').flatMap((l, i) => {
    const patterns = allowed ? EVERYWHERE_PATTERNS : [...CODE_PATTERNS, ...EVERYWHERE_PATTERNS];
    return patterns.some((p) => p.test(l)) ? [i + 1] : [];
  });
  const stringHits = allowed ? [] : strings.filter((s) => STRING_PATTERNS.some((p) => p.test(s.value.trim()))).map((s) => s.line);
  return [...new Set([...codeHits, ...stringHits])].sort((a, b) => a - b).map(at);
}

/** Every host the app may contact, and why. Each is optional, off by default, and used only with the learner's own key. */
export const APPROVED_HOSTS: Readonly<Record<string, string>> = {
  'api.twelvedata.com': 'Optional historical candles (spec §30): Twelve Data time_series, with the learner\'s own API key',
  'api.anthropic.com': 'Optional cloud AI coach (spec §24.3): Anthropic Messages API, with the learner\'s own API key and consent',
};

const URL_PATTERN = /https?:\/\/([A-Za-z0-9.-]+)/g;
const ALLOWED_HOSTS_FILE = 'integrations/http/allowedHosts.ts';

/** Hosts named in integrations/http/ code that are not approved, and differences between the runtime allow-list and APPROVED_HOSTS. */
export function findHostViolations(root: string): string[] {
  const files = walk(join(root, 'integrations/http')).map((path) => relative(root, path).split('\\').join('/'));
  const unapproved = files.flatMap((rel) =>
    readFileSync(join(root, rel), 'utf8')
      .split('\n')
      .flatMap((line, i) => [...line.matchAll(URL_PATTERN)].filter((m) => !(m[1] as string in APPROVED_HOSTS)).map((m) => `${rel}:${i + 1}: host ${m[1]} is not approved`)),
  );
  let runtime: string[] = [];
  try {
    const text = readFileSync(join(root, ALLOWED_HOSTS_FILE), 'utf8');
    const list = /ALLOWED_HOSTS[^=]*=\s*\[([^\]]*)\]/.exec(text)?.[1] ?? '';
    runtime = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
  } catch {
    runtime = [];
  }
  const approved = Object.keys(APPROVED_HOSTS);
  const mismatch = [
    ...runtime.filter((h) => !approved.includes(h)).map((h) => `${ALLOWED_HOSTS_FILE}: ${h} is allowed at runtime but not approved here`),
    ...approved.filter((h) => !runtime.includes(h)).map((h) => `${ALLOWED_HOSTS_FILE}: ${h} is approved here but missing from the runtime allow-list`),
  ];
  return [...unapproved, ...mismatch];
}

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === '__tests__' || name === 'generated') return [];
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) ? [path] : [];
  });
}

/** Source files directly in the project root (config files), which run at build time. */
function rootFiles(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((name) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name) && !name.endsWith('.d.ts'))
      .map((name) => join(root, name))
      .filter((path) => statSync(path).isFile());
  } catch {
    return [];
  }
}

export function findViolations(root: string): string[] {
  return [...rootFiles(root), ...APP_DIRS.flatMap((dir) => walk(join(root, dir)))]
    .map((path) => relative(root, path).split('\\').join('/'))
    .filter((rel) => !PATTERN_FILES.includes(rel))
    .flatMap((rel) => violationsIn(rel, readFileSync(join(root, rel), 'utf8'), ALLOWED_PREFIXES.some((p) => rel.startsWith(p))));
}

if (require.main === module) {
  const violations = [...findViolations(ROOT), ...findHostViolations(ROOT)];
  if (violations.length > 0) {
    console.error('Unexpected network access (outside integrations/http/, or to a host that is not approved):');
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
  console.info('No unexpected network access found.');
}
