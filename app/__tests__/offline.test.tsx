import { render, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { pressEverything, settle, type HostNode } from '../../testing/a11y';
import { resetRouterMock } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());


let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

/* eslint-disable @typescript-eslint/no-require-imports -- screens loaded by path keep the table short */
const SCREENS: readonly [string, () => ComponentType, RegExp][] = [
  ['Coach', () => require('../coach').default, /The coach is off/],
  ['Price data', () => require('../data/index').default, /It is off now/],
  ['Data and AI services', () => require('../(tabs)/more/services').default, /off/i],
  ['News to Learning', () => require('../news').default, /News to Learning|headline/i],
  ['Calendar', () => require('../calendar/index').default, /Sample events/i],
];
/* eslint-enable @typescript-eslint/no-require-imports */

/** Integrations are off by default (spec §37.3): every screen works and nothing goes online until the learner turns a service on. */
describe('offline by default', () => {
  it.each(SCREENS)('%s explains the offline state and never calls a service, even when every control is pressed', async (_name, load, offlineText) => {
    const Screen = load();
    const view = await render(
      <TestProviders container={harness.container}>
        <Screen />
      </TestProviders>,
    );
    await settle(6);
    expect(screen.getAllByText(offlineText).length).toBeGreaterThan(0);
    await pressEverything(() => view.container as unknown as HostNode);
    expect(harness.provider.requests).toEqual([]);
    expect(harness.cloudCoach.requests).toEqual([]);
  });
});
