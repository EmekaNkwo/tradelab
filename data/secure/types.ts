import type { AppError } from '../../shared/errors';
import type { Result } from '../../shared/result';

/**
 * The learner's own API keys (spec §24.3, §30, §34). They live only in the
 * device's secure storage (Keychain / Keystore through expo-secure-store):
 * never in the database, so never in backups, and never logged.
 */
export type SecretName = 'twelvedata_api_key' | 'anthropic_api_key';
export const SECRET_NAMES: readonly SecretName[] = ['twelvedata_api_key', 'anthropic_api_key'];

export const SECRET_LABELS: Readonly<Record<SecretName, string>> = {
  twelvedata_api_key: 'Twelve Data API key',
  anthropic_api_key: 'Anthropic API key',
};

/** A key is a single line of printable characters; anything else is refused before it is stored. */
export const MAX_SECRET_LENGTH = 400;

export interface SecretStore {
  /** False where the platform has no secure storage (web); keys then cannot be saved and online features stay off. */
  isAvailable(): Promise<boolean>;
  get(name: SecretName): Promise<Result<string | null, AppError>>;
  set(name: SecretName, value: string): Promise<Result<void, AppError>>;
  delete(name: SecretName): Promise<Result<void, AppError>>;
}

/** Checks a pasted key: trimmed, one line, printable ASCII, a sensible length. Returns the cleaned key or a reason. */
export function cleanSecret(raw: string): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string } {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, reason: 'Paste your key first' };
  if (value.length < 8) return { ok: false, reason: 'That is too short to be an API key' };
  if (value.length > MAX_SECRET_LENGTH) return { ok: false, reason: 'That is too long to be an API key' };
  if (!/^[\x21-\x7e]+$/.test(value)) return { ok: false, reason: 'A key has no spaces or line breaks; check what was pasted' };
  return { ok: true, value };
}
