const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Android 11+ hides other apps unless the manifest declares them. TradeLab
 * only needs to launch MetaTrader (spec §14.2), so it declares just these two
 * packages instead of the broad QUERY_ALL_PACKAGES permission.
 */
const PACKAGES = ['net.metaquotes.metatrader4', 'net.metaquotes.metatrader5'];

module.exports = function withMetaTraderQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const queries = manifest.queries?.[0] ?? {};
    const existing = new Set((queries.package ?? []).map((p) => p.$['android:name']));
    const added = PACKAGES.filter((p) => !existing.has(p)).map((p) => ({ $: { 'android:name': p } }));
    manifest.queries = [{ ...queries, package: [...(queries.package ?? []), ...added] }, ...(manifest.queries?.slice(1) ?? [])];
    return cfg;
  });
};
