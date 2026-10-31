jest.mock('expo/config-plugins', () => ({
  withAndroidManifest: (config: unknown, action: (c: unknown) => unknown) => action(config),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withMetaTraderQueries = require('../withMetaTraderQueries') as (c: unknown) => { modResults: { manifest: { queries: { package: { $: Record<string, string> }[] }[] } } };

const names = (out: ReturnType<typeof withMetaTraderQueries>) => out.modResults.manifest.queries[0]!.package.map((p) => p.$['android:name']);

describe('withMetaTraderQueries', () => {
  it('declares both MetaTrader packages for Android 11+ package visibility', () => {
    const out = withMetaTraderQueries({ modResults: { manifest: {} } });
    expect(names(out)).toEqual(['net.metaquotes.metatrader4', 'net.metaquotes.metatrader5']);
  });

  it('merges into existing queries without duplicates', () => {
    const manifest = { queries: [{ intent: [{}], package: [{ $: { 'android:name': 'net.metaquotes.metatrader5' } }] }] };
    const out = withMetaTraderQueries({ modResults: { manifest } });
    expect(names(out)).toEqual(['net.metaquotes.metatrader5', 'net.metaquotes.metatrader4']);
    expect((out.modResults.manifest.queries[0] as unknown as { intent: unknown[] }).intent).toHaveLength(1);
  });
});
