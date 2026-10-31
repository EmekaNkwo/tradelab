jest.mock('expo/config-plugins', () => ({
  withAppBuildGradle: (config: unknown, action: (c: unknown) => unknown) => action(config),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withReleaseSigning = require('../withReleaseSigning') as (c: unknown) => { modResults: { contents: string } };

const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

const run = (contents: string) => withReleaseSigning({ modResults: { language: 'groovy', contents } }).modResults.contents;

describe('withReleaseSigning', () => {
  it('adds a release signing config read from Gradle properties, never from the repo', () => {
    const out = run(TEMPLATE);
    expect(out).toContain("if (project.hasProperty('TRADELAB_RELEASE_STORE_FILE')) {");
    expect(out).toContain("storeFile file(TRADELAB_RELEASE_STORE_FILE)");
    expect(out).toContain('storePassword TRADELAB_RELEASE_STORE_PASSWORD');
    expect(out).toContain('keyAlias TRADELAB_RELEASE_KEY_ALIAS');
    expect(out).toContain('keyPassword TRADELAB_RELEASE_KEY_PASSWORD');
  });

  it('signs release builds with it when the key is configured, and keeps debug signing otherwise', () => {
    const out = run(TEMPLATE);
    const release = out.slice(out.indexOf('        release {\n            // Caution'));
    expect(release).toContain("signingConfig project.hasProperty('TRADELAB_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug");
    // Debug builds keep the debug key.
    const debugType = out.slice(out.indexOf('    buildTypes {'), out.indexOf('        release {\n            // Caution'));
    expect(debugType).toContain('signingConfig signingConfigs.debug');
  });

  it('is idempotent', () => {
    const once = run(TEMPLATE);
    expect(run(once)).toBe(once);
  });

  it('fails loudly if the template changed shape, instead of silently shipping debug-signed builds', () => {
    expect(() => run('android {}\n')).toThrow(/withReleaseSigning/);
  });
});

describe('withReleaseSigning on a half-patched file', () => {
  it('throws rather than skipping it', () => {
    const patched = run(TEMPLATE);
    const halfPatched = patched.replace("signingConfig project.hasProperty('TRADELAB_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug", 'signingConfig signingConfigs.debug');
    expect(() => run(halfPatched)).toThrow(/half-patched/);
  });
});
