import { router } from 'expo-router';
import { useEffect } from 'react';
import { useBackup } from '../../features/backup';
import { isFeatureEnabled } from '../../shared/featureFlags';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { DatabaseBackup } from '../ui/icons';
import { ErrorState } from '../ui/StateViews';
import { Notice } from '../ui/Notice';
import { RestorePreview } from './RestorePreview';
import { RestoreResult } from './RestoreResult';

/** Device time zone, for showing when the backup was made before any settings exist. */
const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

/**
 * "Restore from a backup" on the first onboarding screen, for a learner moving to a new phone. Uses the same
 * restore as More › Backup; a successful restore goes straight to Home.
 */
export function OnboardingRestore() {
  const { state, runPick, confirmRestore, reset, allowNotifications } = useBackup();
  // Straight to Home, unless the learner needs to see something first (a permission to allow, a setting turned off).
  const restoredQuietly = state.phase === 'restored' && !state.remindersNeedPermission && !state.stepNoticeTurnedOff;
  useEffect(() => {
    if (restoredQuietly) router.replace('/home');
  }, [restoredQuietly]);
  if (!isFeatureEnabled('backup')) return null;
  const busy = state.phase === 'working';

  return (
    <Card>
      <CardHeader icon={DatabaseBackup} tone="neutral" title="Moving from another phone?" />
      <AppText color="textSecondary">Restore a TradeLab backup file instead of starting again. You will see what is in it before anything changes.</AppText>
      {state.phase === 'restored' && !restoredQuietly ? (
        <>
          <RestoreResult outcome={state} onAllowNotifications={() => void allowNotifications()} />
          <Button label="Go to Home" onPress={() => router.replace('/home')} testID="onboarding-restore-home" />
        </>
      ) : null}
      {state.phase === 'restored' ? null : state.phase === 'preview' ? (
        <RestorePreview inCard picked={state.picked} timeZone={deviceTimeZone()} onConfirm={(p) => void confirmRestore(p)} onCancel={reset} />
      ) : (
        <Button label="Restore from a backup" variant="secondary" onPress={() => void runPick()} busy={busy} disabled={busy} testID="onboarding-restore" />
      )}
      {busy && state.action === 'restore' ? (
        <Notice live title="Restoring…">
          <AppText>Please keep the app open.</AppText>
        </Notice>
      ) : null}
      {state.phase === 'error' ? <ErrorState error={state.error} onRetry={reset} /> : null}
    </Card>
  );
}
