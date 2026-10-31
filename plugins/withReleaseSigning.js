const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs local release builds with the owner's own key instead of the template's debug key.
 * The key and its passwords live outside the repo, in ~/.gradle/gradle.properties
 * (TRADELAB_RELEASE_STORE_FILE, _STORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD). Without them the
 * release build falls back to debug signing, so CI and other machines still build.
 * EAS builds use EAS credentials and are not affected.
 */
const PROP = 'TRADELAB_RELEASE_STORE_FILE';

const RELEASE_CONFIG = `        if (project.hasProperty('${PROP}')) {
            release {
                storeFile file(TRADELAB_RELEASE_STORE_FILE)
                storePassword TRADELAB_RELEASE_STORE_PASSWORD
                keyAlias TRADELAB_RELEASE_KEY_ALIAS
                keyPassword TRADELAB_RELEASE_KEY_PASSWORD
            }
        }
`;

const RELEASE_TYPE = /(\n        release \{\n(?:[ \t]*\/\/[^\n]*\n)*[ \t]*)signingConfig signingConfigs\.debug/;
const SIGNING_BLOCK = /(\n    signingConfigs \{\n[\s\S]*?\n        \}\n)(    \})/;

function applyReleaseSigning(contents) {
  const hasConfig = contents.includes(`if (project.hasProperty('${PROP}'))`);
  const hasType = contents.includes(`signingConfig project.hasProperty('${PROP}')`);
  if (hasConfig && hasType) return contents;
  if (hasConfig !== hasType) throw new Error('withReleaseSigning: android/app/build.gradle is half-patched; run `npx expo prebuild --clean`.');
  if (!SIGNING_BLOCK.test(contents) || !RELEASE_TYPE.test(contents)) {
    throw new Error('withReleaseSigning: android/app/build.gradle no longer has the expected signingConfigs/release blocks; update the plugin.');
  }
  return contents
    .replace(SIGNING_BLOCK, `$1${RELEASE_CONFIG}$2`)
    .replace(RELEASE_TYPE, `$1signingConfig project.hasProperty('${PROP}') ? signingConfigs.release : signingConfigs.debug`);
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => ({
    ...cfg,
    modResults: { ...cfg.modResults, contents: applyReleaseSigning(cfg.modResults.contents) },
  }));
};
