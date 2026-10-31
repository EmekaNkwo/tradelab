/** Logic tests (domain, data, shared, scripts) run in Node; UI tests run in the React Native preset. */
const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/$1',
  // lucide-react-native's "react-native" entry is ESM (.mjs), which Jest's CommonJS runtime cannot load; its CJS build is the same icons.
  '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
};

module.exports = {
  projects: [
    {
      displayName: 'logic',
      preset: 'jest-expo/node',
      // Closes test databases a file left open, after all of its hooks (see testing/env/).
      testEnvironment: '<rootDir>/testing/env/nodeEnvironment.js',
      moduleNameMapper,
      testMatch: ['<rootDir>/**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/'],
    },
    {
      displayName: 'ui',
      preset: 'jest-expo/android',
      testEnvironment: '<rootDir>/testing/env/nativeEnvironment.js',
      // RNGH's own Jest setup: mocks its native module and renders gesture detectors as Views.
      setupFiles: ['react-native-gesture-handler/jestSetup.js'],
      setupFilesAfterEnv: ['<rootDir>/testing/jestSetupUi.tsx'],
      moduleNameMapper,
      testMatch: ['<rootDir>/**/__tests__/**/*.test.tsx'],
      testPathIgnorePatterns: ['/node_modules/'],
    },
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'integrations/**/*.{ts,tsx}',
    'di/**/*.{ts,tsx}',
    'shared/**/*.ts',
    'domain/**/*.ts',
    'data/**/*.ts',
    'features/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/__tests__/**',
    '!**/*.d.ts',
    '!**/index.ts',
  ],
};
