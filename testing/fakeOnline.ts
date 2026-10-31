import type { CloudCoachRequest, CloudCoachTransport } from '../data/coach/types';
import type { MarketDataProvider, ProviderSeries, ProviderSeriesRequest } from '../data/market/provider';
import { providerUnavailable, type AppError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';
import { createFakeDatasetFiles } from './fakeDatasetFiles';
import { createFakeSecretStore } from './fakeSecretStore';
import { createFakeTaskNotifications } from './fakeTaskNotifications';

/** Test-only market data provider: tests queue the next response and see every request. */
export interface FakeProvider extends MarketDataProvider {
  next: Result<ProviderSeries, AppError>;
  readonly requests: ProviderSeriesRequest[];
}

/** `count` hourly rows from 2024-01-01 00:00 UTC, gently rising. */
export function providerRows(count: number, start = Date.UTC(2024, 0, 1)): ProviderSeries['rows'] {
  return Array.from({ length: count }, (_, i) => {
    const base = 1.1 + i * 0.0001;
    const t = new Date(start + i * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    return { datetime: t, open: base.toFixed(5), high: (base + 0.0005).toFixed(5), low: (base - 0.0005).toFixed(5), close: (base + 0.0001).toFixed(5), volume: '0' };
  });
}

export function createFakeProvider(): FakeProvider {
  const fake: FakeProvider = {
    id: 'twelvedata',
    name: 'Twelve Data',
    requestsPerMinute: 8,
    requestsPerDay: 800,
    maxCandles: 5000,
    timeframes: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
    next: err(providerUnavailable('no response queued')),
    requests: [],
    fetchSeries: async (req) => {
      fake.requests.push(req);
      return fake.next;
    },
  };
  return fake;
}

/** Test-only cloud coach: a mocked transport that records every request. */
export interface FakeCloudCoach extends CloudCoachTransport {
  next: Result<{ text: string }, AppError>;
  readonly requests: CloudCoachRequest[];
}

export function createFakeCloudCoach(): FakeCloudCoach {
  const fake: FakeCloudCoach = {
    providerName: 'Anthropic',
    next: ok({ text: 'Under your rules this setup meets some conditions.\n\nIt could still fail.' }),
    requests: [],
    send: async (req) => {
      fake.requests.push(req);
      return fake.next;
    },
  };
  return fake;
}

/** The online and secure-storage fakes every test container needs. */
export function createOnlineFakes() {
  // taskNotifications rides along here so every harness and bootstrap test gets the device fake too.
  return { secrets: createFakeSecretStore(), datasetFiles: createFakeDatasetFiles(), marketProvider: createFakeProvider(), cloudCoach: createFakeCloudCoach(), taskNotifications: createFakeTaskNotifications() };
}
