import { cleanSecret, type SecretName, type SecretStore } from '../data/secure/types';
import { validationError } from '../shared/errors';
import { registerSecret } from '../shared/redact';
import { err, ok } from '../shared/result';

/** Test-only secure storage: an in-memory map, with switches for "unavailable" and "fails". */
export interface FakeSecretStore extends SecretStore {
  readonly values: Map<SecretName, string>;
  available: boolean;
  failing: boolean;
  /** Only deletes fail (the key stays). */
  deleteFails: boolean;
}

export function createFakeSecretStore(): FakeSecretStore {
  const fake: FakeSecretStore = {
    values: new Map(),
    available: true,
    failing: false,
    deleteFails: false,
    isAvailable: async () => fake.available,
    get: async (name) => (fake.failing ? err(validationError('secure storage failed')) : ok(fake.values.get(name) ?? null)),
    set: async (name, raw) => {
      const cleaned = cleanSecret(raw);
      if (!cleaned.ok) return err(validationError(cleaned.reason));
      if (!fake.available) return err(validationError('This device has no secure storage, so keys cannot be saved here'));
      if (fake.failing) return err(validationError('secure storage failed'));
      registerSecret(cleaned.value);
      fake.values.set(name, cleaned.value);
      return ok(undefined);
    },
    delete: async (name) => {
      if (fake.failing || fake.deleteFails) return err(validationError('secure storage failed'));
      fake.values.delete(name);
      return ok(undefined);
    },
  };
  return fake;
}
