import * as SecureStore from 'expo-secure-store';
import type { SecretName, SecretStore } from '../../data/secure/types';
import { cleanSecret } from '../../data/secure/types';
import { fromUnknown, validationError } from '../../shared/errors';
import { forgetSecret, registerSecret } from '../../shared/redact';
import { err, ok } from '../../shared/result';

/**
 * Secure storage on the phone (expo-secure-store, SDK 58). Keys are stored
 * with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so they are not carried into iCloud
 * or device-to-device transfers. Every key read or saved is registered with
 * the log redactor. On web, where SecureStore is not available, nothing is
 * stored and `isAvailable` is false.
 */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const STORE_KEY: Readonly<Record<SecretName, string>> = { twelvedata_api_key: 'tradelab.twelvedata_api_key', anthropic_api_key: 'tradelab.anthropic_api_key' };

export function createExpoSecretStore(): SecretStore {
  const available = async (): Promise<boolean> => {
    try {
      return await SecureStore.isAvailableAsync();
    } catch {
      return false;
    }
  };
  return {
    isAvailable: available,
    async get(name) {
      if (!(await available())) return ok(null);
      try {
        const value = await SecureStore.getItemAsync(STORE_KEY[name], OPTIONS);
        if (value) registerSecret(value);
        return ok(value);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the key from secure storage failed', cause));
      }
    },
    async set(name, raw) {
      const cleaned = cleanSecret(raw);
      if (!cleaned.ok) return err(validationError(cleaned.reason));
      if (!(await available())) return err(validationError('This device has no secure storage, so keys cannot be saved here'));
      try {
        registerSecret(cleaned.value);
        await SecureStore.setItemAsync(STORE_KEY[name], cleaned.value, OPTIONS);
        return ok(undefined);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving the key to secure storage failed', cause));
      }
    },
    async delete(name) {
      if (!(await available())) return ok(undefined);
      try {
        const old = await SecureStore.getItemAsync(STORE_KEY[name], OPTIONS);
        await SecureStore.deleteItemAsync(STORE_KEY[name], OPTIONS);
        if (old) forgetSecret(old);
        return ok(undefined);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Deleting the key failed', cause));
      }
    },
  };
}
