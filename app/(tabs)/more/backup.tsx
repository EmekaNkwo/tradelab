import { describeCounts, RestorePreview } from '../../../components/backup/RestorePreview';
import { RestoreResult } from '../../../components/backup/RestoreResult';
import { AppText, Button, Card, CardHeader, ErrorState, Notice, Screen } from '../../../components/ui';
import { DatabaseBackup, RotateCcw } from '../../../components/ui/icons';
import { useBackup } from '../../../features/backup';
import { useSettings } from '../../../features/settings';
import { formatInTimeZone } from '../../../shared/time';

export default function BackupScreen() {
  const { state, runExport, runPick, confirmRestore, reset, allowNotifications } = useBackup();
  const settings = useSettings();
  const timeZone = settings.status === 'success' ? settings.data.timeZone : 'UTC';
  const busy = state.phase === 'working';

  return (
    <Screen testID="backup-screen">
      {/* Progress and outcome first, so they are on screen without scrolling (flows 10a/10b wait for them). */}
      {state.phase === 'working' && state.action === 'restore' ? (
        <Notice live title="Restoring…">
          <AppText>Please keep the app open.</AppText>
        </Notice>
      ) : null}

      {state.phase === 'exported' ? (
        <Notice live title="Backup created" tone="success">
          <AppText>
            {state.shared
              ? `Saved ${describeCounts(state.summary)}. Keep the file somewhere safe.`
              : `Saved ${describeCounts(state.summary)} in the app's files. Sharing is not available on this device.`}
          </AppText>
        </Notice>
      ) : null}

      {state.phase === 'restored' ? <RestoreResult outcome={state} onAllowNotifications={() => void allowNotifications()} /> : null}
      {state.phase === 'error' ? <ErrorState error={state.error} onRetry={reset} /> : null}

      <Card>
        <CardHeader icon={DatabaseBackup} tone="brand" title="Back up" />
        <AppText color="textSecondary">
          Saves your settings and progress to a file you can keep in your files app, email to yourself, or move to a new phone. API keys
          are never included, and neither is price data fetched from a provider, so backtests run on fetched data cannot be repeated
          after a restore until you fetch that data again (and the new copy may differ). Your imported files are included.
        </AppText>
        {settings.status === 'success' && settings.data.lastBackupAt ? (
          <AppText variant="caption" color="textSecondary">
            Last backup: {formatInTimeZone(settings.data.lastBackupAt, timeZone)}
          </AppText>
        ) : null}
        <Button label="Create backup file" onPress={runExport} busy={busy && state.action === 'export'} disabled={busy} />
      </Card>

      <Card>
        <CardHeader icon={RotateCcw} tone="neutral" title="Restore" />
        <AppText color="textSecondary">Replaces everything on this phone with the contents of a backup file. You will see what is in the file before anything changes.</AppText>
        <Button label="Choose backup file" variant="secondary" onPress={runPick} busy={busy && state.action === 'pick'} disabled={busy} />
      </Card>

      {state.phase === 'preview' ? <RestorePreview picked={state.picked} timeZone={timeZone} onConfirm={(p) => void confirmRestore(p)} onCancel={reset} /> : null}
    </Screen>
  );
}
