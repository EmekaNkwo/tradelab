// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * Layer rules from docs/architecture.md (spec §32A.1). Dependencies point
 * downwards only; `di/` is the composition root and may wire anything.
 */
const zone = (target, from, message, except) => ({ target, from, message, ...(except ? { except } : {}) });
const UI = ['./app', './components', './theme'];

const layerZones = [
  // Presentation goes through features.
  ...['./app', './components'].flatMap((t) =>
    ['./data', './integrations', './domain', './workers'].map((f) => zone(t, f, 'Screens and components must go through features/.')),
  ),
  zone('./app/(tabs)', './di', 'Only app/_layout.tsx may use the composition root.'),
  zone('./components', './di', 'Components must not use the composition root.'),
  // Features may use data only through its public interfaces.
  zone('./features', './data', 'Features may import data interfaces only via data/index.ts.', ['./index.ts']),
  zone('./features', './integrations', 'Features use integrations through data/ interfaces injected by di/.'),
  zone('./features', './app', 'Features must not import screens.'),
  zone('./features', './di', 'Features receive dependencies via the container, not di/.'),
  // Domain is pure.
  ...['./data', './integrations', './features', './di', './workers', ...UI].map((f) =>
    zone('./domain', f, 'domain/ may import shared/ only.'),
  ),
  // Data does not know about UI or features.
  ...['./features', './di', ...UI].map((f) => zone('./data', f, 'data/ must not import features or UI.')),
  ...['./domain', './features', './di', ...UI].map((f) => zone('./integrations', f, 'integrations/ may import data interfaces and shared/ only.')),
  // Shared is the bottom layer.
  ...['./data', './integrations', './features', './domain', './di', './workers', ...UI].map((f) =>
    zone('./shared', f, 'shared/ must not import other layers.'),
  ),
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'coverage/*', '.expo/*', 'data/content/generated/*', 'content/schemas/*'],
  },
  {
    rules: {
      'import/no-restricted-paths': ['error', { zones: layerZones }],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\./(?!\\.)[^/]+/.+',
              message: "Import another feature through its public index (e.g. '../settings'), not its internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['domain/**/*.ts'],
    ignores: ['domain/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'domain/ receives "now" as a parameter.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'domain/ receives "now" as a parameter.' },
        { selector: "MemberExpression[object.name='Math'][property.name='random']", message: 'domain/ must be deterministic; inject a seeded random source.' },
        { selector: "CallExpression[callee.name='fetch']", message: 'domain/ must not use the network.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^(react|react-native|expo.*|@expo/.*|zustand)$', message: 'domain/ is framework-free TypeScript.' }] },
      ],
    },
  },
  {
    // Network access only through integrations/http (spec §32A.6); scripts/check-network.ts also checks this.
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['integrations/http/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use the guarded client in integrations/http.' },
        { name: 'XMLHttpRequest', message: 'Use the guarded client in integrations/http.' },
        { name: 'WebSocket', message: 'The app does not open sockets.' },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
]);
