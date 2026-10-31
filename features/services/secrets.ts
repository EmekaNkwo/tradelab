import { useCallback } from 'react';
import { SECRET_NAMES, type SecretName } from '../../data';
import type { AppSettings, IntegrationSettings } from '../../domain/models/learner';
import { shownError, validationError, type AppError } from '../../shared/errors';
import { err, ok, type Result } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type Container } from '../app';

/**
 * The learner's own keys and the online switches (spec §24.3, §30, §34).
 * Screens only ever learn whether a key is saved, never the key itself.
 * Deleting a key also switches off the service that needs it.
 */

export interface SecretsStatus {
  readonly available: boolean;
  readonly saved: Readonly<Record<SecretName, boolean>>;
}

const SECRET_FOR: Readonly<Record<'marketProvider' | 'cloudCoach', SecretName>> = { marketProvider: 'twelvedata_api_key', cloudCoach: 'anthropic_api_key' };

export async function secretsStatus(c: Pick<Container, 'secrets'>): Promise<Result<SecretsStatus, AppError>> {
  const available = await c.secrets.isAvailable();
  const entries: [SecretName, boolean][] = [];
  for (const name of SECRET_NAMES) {
    const value = await c.secrets.get(name);
    if (!value.ok) return value;
    entries.push([name, value.value !== null]);
  }
  return ok({ available, saved: Object.fromEntries(entries) as Record<SecretName, boolean> });
}

export async function saveSecret(c: Pick<Container, 'secrets' | 'bus'>, name: SecretName, value: string): Promise<Result<void, AppError>> {
  const r = await c.secrets.set(name, value);
  if (r.ok) c.bus.emit(['secrets']);
  return r;
}

/**
 * Turns off whatever uses the key first, then deletes it, so a failed delete
 * never leaves a service on without the learner knowing. A failed delete is
 * reported with its own message; the service stays off.
 */
export async function deleteSecret(c: Pick<Container, 'secrets' | 'settings' | 'clock' | 'bus'>, name: SecretName): Promise<Result<void, AppError>> {
  const settings = await c.settings.get();
  if (!settings.ok) return settings;
  const i = settings.value.integrations;
  const next: IntegrationSettings = {
    ...i,
    marketProvider: name === SECRET_FOR.marketProvider ? false : i.marketProvider,
    coach: name === SECRET_FOR.cloudCoach && i.coach === 'cloud' ? 'curated' : i.coach,
  };
  const off = await c.settings.update({ integrations: next }, toUtcIso(c.clock.now()));
  if (!off.ok) return off;
  const removed = await c.secrets.delete(name);
  c.bus.emit(['secrets']);
  if (!removed.ok) return err(shownError(removed.error.kind, 'The service was turned off, but the key could not be deleted from secure storage. Try again.', { cause: removed.error }));
  return ok(undefined);
}

/** Changes the online switches. Turning on a service that needs a key is refused until the key is saved. */
export async function updateIntegrations(c: Pick<Container, 'secrets' | 'settings' | 'clock'>, patch: Partial<IntegrationSettings>): Promise<Result<AppSettings, AppError>> {
  const settings = await c.settings.get();
  if (!settings.ok) return settings;
  const next = { ...settings.value.integrations, ...patch };
  if (patch.marketProvider === true) {
    const key = await c.secrets.get(SECRET_FOR.marketProvider);
    if (!key.ok) return key;
    if (!key.value) return err(validationError('Save your Twelve Data API key first'));
  }
  if (patch.coach === 'cloud') {
    const key = await c.secrets.get(SECRET_FOR.cloudCoach);
    if (!key.ok) return key;
    if (!key.value) return err(validationError('Save your Anthropic API key first'));
  }
  return c.settings.update({ integrations: next }, toUtcIso(c.clock.now()));
}

export function useSecretsStatus() {
  const c = useContainer();
  return useLiveQuery(() => secretsStatus(c), ['secrets']);
}

export function useServiceActions() {
  const c = useContainer();
  return {
    save: useCallback((name: SecretName, value: string) => saveSecret(c, name, value), [c]),
    remove: useCallback((name: SecretName) => deleteSecret(c, name), [c]),
    update: useCallback((patch: Partial<IntegrationSettings>) => updateIntegrations(c, patch), [c]),
  };
}
