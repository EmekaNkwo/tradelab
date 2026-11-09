import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import HomeScreen from '../(tabs)/home/index';
import AboutScreen from '../(tabs)/more/about';
import BackupScreen from '../(tabs)/more/backup';
import MoreScreen from '../(tabs)/more/index';
import SettingsScreen from '../(tabs)/more/settings';

import { completeOnboarding } from '../../features/learning/useCases';
import { resetRouterMock, routerMock as router } from '../../testing/routerMock';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
});
afterEach(() => harness.db.close());

const renderWith = (ui: React.ReactElement) => render(<TestProviders container={harness.container}>{ui}</TestProviders>);

describe('Home', () => {
  it('sends a new learner to onboarding', async () => {
    await renderWith(<HomeScreen />);
    expect(await screen.findByText('redirect:/onboarding')).toBeTruthy();
  });

  it('shows backup status once onboarded', async () => {
    const enrolled = await completeOnboarding(harness.container, {
      riskAcknowledged: true,
      experience: 'complete_beginner',
      markets: ['forex'],
      goals: ['understand_markets'],
      explanationLevel: 'simple',
      metaTrader: null,
      timeZone: 'Africa/Lagos',
      programId: 'practical-forex-trader',
      settings: { startDate: '2026-10-29' as never, timeline: { kind: 'weeks', weeks: 4 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
      classTime: null,
      remindersEnabled: false,
      placementPassedModuleIds: [],
    });
    expect(enrolled.ok).toBe(true);
    await renderWith(<HomeScreen />);
    expect(await screen.findByText('You have not made a backup yet.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back up or restore' }));
    expect(router.push).toHaveBeenCalledWith('/more/backup', { withAnchor: true });
  });
});

describe('More', () => {
  it('lists only implemented areas and every row navigates', async () => {
    await renderWith(<MoreScreen />);
    const expected: [string, string][] = [
      ['more-settings', '/more/settings'],
      ['more-backup', '/more/backup'],
      ['more-disclosures', '/more/about'],
    ];
    for (const [testID, href] of expected) {
      await fireEvent.press(screen.getByTestId(testID));
      expect(router.push).toHaveBeenLastCalledWith(href);
    }
    expect(router.push).toHaveBeenCalledTimes(expected.length);
  });
});

describe('Settings', () => {
  it('persists the theme choice to the database', async () => {
    await renderWith(<SettingsScreen />);
    await fireEvent.press(await screen.findByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Dark' })).toBeSelected());
    const stored = await harness.container.settings.get();
    expect(stored.ok && stored.value.theme).toBe('dark');
    expect(screen.getByTestId('time-zone')).toHaveTextContent('Africa/Lagos');
    await fireEvent.press(screen.getByRole('radio', { name: 'Advanced' }));
    await waitFor(async () => {
      const s = await harness.container.settings.get();
      expect(s.ok && s.value.explanationLevel).toBe('advanced');
    });
  });
});

describe('About', () => {
  it('shows all risk warnings without statistics and the content version', async () => {
    await renderWith(<AboutScreen />);
    expect(screen.getByText(/losses on a futures position can be larger than the margin/i)).toBeTruthy();
    expect(screen.getByText(/does not show that you are ready to trade real money/i)).toBeTruthy();
    expect(screen.getByTestId('content-version')).toHaveTextContent(/Content 2026\.\d+\.\d+/);
    expect(screen.queryByText(/\[\[/)).toBeNull();
  });
});

describe('Backup and restore', () => {
  it('exports a backup, records the time, then restores it after confirmation', async () => {
    await harness.container.settings.update({ theme: 'dark' }, '2026-10-29T09:00:00.000Z' as never);
    await renderWith(<BackupScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Create backup file' }));
    expect(await screen.findByText('Backup created')).toBeTruthy();
    expect(harness.files.saved).toHaveLength(1);
    expect(await screen.findByText(/Last backup: 29 Oct 2026, 11:00/)).toBeTruthy();

    await harness.container.settings.update({ theme: 'light' }, '2026-10-29T10:30:00.000Z' as never);
    harness.files.nextPick = harness.files.saved[0]?.text ?? null;
    await fireEvent.press(screen.getByRole('button', { name: 'Choose backup file' }));
    expect(await screen.findByText('Restore this backup?')).toBeTruthy();

    const before = await harness.container.settings.get();
    expect(before.ok && before.value.theme).toBe('light');

    await fireEvent.press(screen.getByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByText('Restore complete')).toBeTruthy();
    const after = await harness.container.settings.get();
    expect(after.ok && after.value.theme).toBe('dark');
  });

  it('cancelling the preview changes nothing', async () => {
    await renderWith(<BackupScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Create backup file' }));
    await screen.findByText('Backup created');
    harness.files.nextPick = harness.files.saved[0]?.text ?? null;
    await fireEvent.press(screen.getByRole('button', { name: 'Choose backup file' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Restore this backup?')).toBeNull();
  });

  it('shows a clear error for a damaged file and nothing is restored', async () => {
    harness.files.nextPick = '{"format":"something-else"}';
    await renderWith(<BackupScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose backup file' }));
    expect(await screen.findByText('This data has a problem')).toBeTruthy();
    expect(screen.queryByText('Restore this backup?')).toBeNull();
  });

  it('does nothing when the learner cancels the file picker', async () => {
    harness.files.nextPick = null;
    await renderWith(<BackupScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose backup file' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose backup file' })).toBeEnabled());
    expect(screen.queryByText('Restore this backup?')).toBeNull();
  });
});
