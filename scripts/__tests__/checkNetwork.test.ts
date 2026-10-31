import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APPROVED_HOSTS, findHostViolations, findViolations } from '../check-network';
import { ALLOWED_HOSTS } from '../../integrations/http/allowedHosts';

describe('check-network', () => {
  let root: string;
  const write = (rel: string, body: string) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), body);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tradelab-net-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('flags network calls outside integrations/http', () => {
    write('domain/x.ts', 'const r = await fetch("https://example.org");');
    write('features/y.ts', "import axios from 'axios';");
    write('integrations/http/client.ts', 'export const go = () => fetch(url);');
    write('data/__tests__/z.test.ts', 'fetch(url)');
    expect([...findViolations(root)].sort()).toEqual([
      expect.stringMatching(/^domain\/x.ts:1/),
      expect.stringMatching(/^features\/y.ts:1/),
    ]);
  });

  it('flags network SDK imports outside integrations/http', () => {
    write('features/coach.ts', "import Anthropic from '@anthropic-ai/sdk';");
    write('integrations/http/coach.ts', "import Anthropic from '@anthropic-ai/sdk';");
    expect(findViolations(root)).toEqual([expect.stringMatching(/^features\/coach.ts:1/)]);
  });

  it('flags hosts in integrations/http that are not approved, and allow-list drift', () => {
    write('integrations/http/allowedHosts.ts', "export const ALLOWED_HOSTS: readonly string[] = ['api.twelvedata.com', 'evil.example.com'];");
    write('integrations/http/client.ts', "const a = 'https://api.twelvedata.com/time_series';\nconst b = 'https://tracker.example.net/x';");
    const found = findHostViolations(root);
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/client.ts:2: host tracker.example.net is not approved/),
        expect.stringMatching(/evil.example.com is allowed at runtime but not approved/),
        expect.stringMatching(/api.anthropic.com is approved here but missing/),
      ]),
    );
    expect(found.some((f) => f.includes('client.ts:1'))).toBe(false);
  });

  it('gives a reason for every approved host, and matches the runtime allow-list', () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual(Object.keys(APPROVED_HOSTS).sort());
    for (const reason of Object.values(APPROVED_HOSTS)) expect(reason.length).toBeGreaterThan(20);
  });

  it('passes on the real codebase', () => {
    const root = join(__dirname, '..', '..');
    expect(findViolations(root)).toEqual([]);
    expect(findHostViolations(root)).toEqual([]);
  });
});

describe('check-network hardening (I)', () => {
  let root: string;
  const write = (rel: string, body: string) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), body);
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tradelab-net2-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const flagged = () => findViolations(root).map((v) => v.split(':').slice(0, 2).join(':'));

  it('catches aliased, bracket and global fetch, and other network globals', () => {
    write('features/a.ts', 'const f = fetch;\nconst g = globalThis["fetch"];\nconst h = globalThis.fetch;');
    write('features/b.ts', 'new XMLHttpRequest();\nconst s = new WebSocket(u);\nconst e = new EventSource(u);');
    expect(flagged()).toEqual(['features/a.ts:1', 'features/a.ts:2', 'features/a.ts:3', 'features/b.ts:1', 'features/b.ts:2', 'features/b.ts:3']);
  });

  it('catches require and dynamic import of network modules, and socket URLs', () => {
    write('data/a.ts', "const A = require('@anthropic-ai/sdk');\nconst B = await import(\"@anthropic-ai/sdk/core\");\nimport { fetch as f } from 'expo/fetch';\nimport WebView from 'react-native-webview';\nconst u = `wss://example.org/socket`;");
    expect(flagged()).toEqual(['data/a.ts:1', 'data/a.ts:2', 'data/a.ts:3', 'data/a.ts:4', 'data/a.ts:5']);
  });

  it('refuses baseURL overrides even inside integrations/http, and allows fetch there', () => {
    write('integrations/http/a.ts', "const c = new Anthropic({ apiKey, fetch, baseURL: 'https://api.anthropic.com' });\nconst r = await fetch(url);");
    expect(flagged()).toEqual(['integrations/http/a.ts:1']);
  });

  it('scans .mjs and .cjs files, root config files, plugins and scripts, but not comments, prose or tests', () => {
    write('plugins/p.cjs', 'module.exports = () => fetch(u);');
    write('scripts/s.mjs', 'await fetch(u);');
    write('metro.config.js', 'const x = require("node-fetch");');
    write('features/ok.tsx', '// fetch(url) in a comment\nconst label = "It does not fetch news";\nconst el = <Text>We never fetch that data</Text>;');
    write('scripts/__tests__/t.test.ts', 'fetch(u)');
    expect(flagged()).toEqual(['metro.config.js:1', 'plugins/p.cjs:1', 'scripts/s.mjs:1']);
  });
});
