import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exportBackup } from '../../features/backup/useCases';
import { completeOnboarding } from '../../features/learning/useCases';
import { resetFeatureFlags, turnFeaturesOff } from '../../testing/featureFlagSeam';
import { resetRouterMock, routerMock } from '../../testing/routerMock';
import { createTestHarness, TestProviders, type TestHarness } from '../../testing/testContainer';
import OnboardingScreen from '../onboarding';

jest.mock('expo-router', () => jest.requireActual<typeof import('../../testing/routerMock')>('../../testing/routerMock').createRouterModule());
jest.mock('../../shared/featureFlags', () => jest.requireActual<typeof import('../../testing/featureFlagSeam')>('../../testing/featureFlagSeam').createFeatureFlagsModule());


/** A backup made on the "old phone": a learner who finished onboarding. */
async function backupFromOldPhone(options: { readonly reminders?: boolean; readonly stepNotice?: boolean; readonly setUp?: boolean } = {}): Promise<string> {
  const old = await createTestHarness();
  try {
    if (options.setUp === false) {
      const exported = await exportBackup(old.container);
      if (!exported.ok) throw new Error(exported.error.message);
      return old.files.saved[0]!.text;
    }
    if (options.stepNotice) await old.container.settings.update({ mtStepNotification: true }, '2026-10-29T09:00:00.000Z' as never);
    const r = await completeOnboarding(old.container, {
      riskAcknowledged: true,
      experience: 'complete_beginner',
      markets: ['forex'],
      goals: ['understand_markets'],
      explanationLevel: 'simple',
      metaTrader: null,
      timeZone: 'Africa/Lagos',
      programId: 'practical-forex-trader',
      settings: { startDate: '2026-10-29' as never, timeline: { kind: 'weeks', weeks: 4 }, studyDays: [1, 2, 3, 4, 5], dailyMinutes: 15 },
      classTime: options.reminders ? '19:00' : null,
      remindersEnabled: options.reminders ?? false,
      placementPassedModuleIds: [],
    });
    if (!r.ok) throw new Error(r.error.message);
    const exported = await exportBackup(old.container);
    if (!exported.ok) throw new Error(exported.error.message);
    return old.files.saved[0]!.text;
  } finally {
    old.db.close();
  }
}

let harness: TestHarness;
beforeEach(async () => {
  harness = await createTestHarness();
  resetRouterMock();
  resetFeatureFlags();
});
afterEach(() => harness.db.close());

const renderOnboarding = () =>
  render(
    <TestProviders container={harness.container}>
      <OnboardingScreen />
    </TestProviders>,
  );

describe('restore from a backup during onboarding', () => {
  it('offers it on the first screen, previews the file, restores it and lands on Home', async () => {
    harness.files.nextPick = await backupFromOldPhone();
    await renderOnboarding();
    expect(screen.getByText('Step 1 of', { exact: false })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from a backup' }));
    expect(await screen.findByText('Restore this backup?')).toBeTruthy();
    expect(await harness.container.learning.currentEnrolment()).toEqual(expect.objectContaining({ ok: true, value: null }));
    await fireEvent.press(screen.getByRole('button', { name: 'Replace my data' }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/home'));
    const enrolment = await harness.container.learning.currentEnrolment();
    expect(enrolment.ok && enrolment.value?.programId).toBe('practical-forex-trader');
  });

  it('cancelling the preview keeps the learner on onboarding with nothing changed', async () => {
    harness.files.nextPick = await backupFromOldPhone();
    await renderOnboarding();
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from a backup' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Restore from a backup' })).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('shows a clear error for a damaged file', async () => {
    harness.files.nextPick = '{"format":"something-else"}';
    await renderOnboarding();
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from a backup' }));
    expect(await screen.findByText('This data has a problem')).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('is hidden when backups are switched off', async () => {
    turnFeaturesOff('backup');
    await renderOnboarding();
    expect(screen.queryByRole('button', { name: 'Restore from a backup' })).toBeNull();
  });

  it('warns when the backup comes from a phone that had not finished setup', async () => {
    harness.files.nextPick = await backupFromOldPhone({ setUp: false });
    await renderOnboarding();
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from a backup' }));
    expect(await screen.findByTestId('restore-no-profile')).toHaveTextContent(/hadn't finished setup/);
  });

  it('does not prompt for notifications on restore: it says what needs permission and asks only on a tap', async () => {
    harness.files.nextPick = await backupFromOldPhone({ reminders: true, stepNotice: true });
    harness.reminders.outcome = 'permission_denied';
    await renderOnboarding();
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from a backup' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Replace my data' }));
    expect(await screen.findByTestId('restore-reminders-permission')).toBeTruthy();
    expect(screen.getByTestId('restore-step-notice-off')).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(harness.reminders.options.every((o) => !o.prompt)).toBe(true);
    const s = await harness.container.settings.get();
    expect(s.ok && s.value.mtStepNotification).toBe(false);

    harness.reminders.outcome = 'scheduled';
    await fireEvent.press(screen.getByRole('button', { name: 'Allow notifications' }));
    await waitFor(() => expect(screen.queryByTestId('restore-reminders-permission')).toBeNull());
    expect(harness.reminders.options.at(-1)).toEqual({ prompt: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }));
    expect(routerMock.replace).toHaveBeenCalledWith('/home');
  });
});
