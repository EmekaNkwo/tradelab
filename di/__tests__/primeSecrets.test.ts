import type { SecretStore } from '../../data/secure/types';
import { ok } from '../../shared/result';
import { primeSecretRedaction } from '../bootstrapCore';

describe('start-up key registration (security L6)', () => {
  it('reads every saved key once at start-up so the store can register it', async () => {
    const names: string[] = [];
    const store = { get: async (name: string) => (names.push(name), ok(null)) } as unknown as SecretStore;
    await primeSecretRedaction(store);
    expect(names.sort()).toEqual(['anthropic_api_key', 'twelvedata_api_key']);
  });
});
