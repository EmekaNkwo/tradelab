import { useCallback, useState } from 'react';
import type { BackupSummary } from '../../data';
import type { AppError } from '../../shared/errors';
import { useContainer } from '../app';
import { allowReminderNotifications, exportBackup, pickBackup, restorePickedBackup, type PickedBackup, type RestoreOutcome } from './useCases';

export type BackupState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'working'; readonly action: 'export' | 'pick' | 'restore' }
  | { readonly phase: 'exported'; readonly summary: BackupSummary; readonly shared: boolean }
  | { readonly phase: 'preview'; readonly picked: PickedBackup }
  | ({ readonly phase: 'restored' } & RestoreOutcome)
  | { readonly phase: 'error'; readonly error: AppError };

export function useBackup() {
  const container = useContainer();
  const [state, setState] = useState<BackupState>({ phase: 'idle' });

  const runExport = useCallback(async () => {
    setState({ phase: 'working', action: 'export' });
    const result = await exportBackup(container);
    setState(result.ok ? { phase: 'exported', ...result.value } : { phase: 'error', error: result.error });
  }, [container]);

  const runPick = useCallback(async () => {
    setState({ phase: 'working', action: 'pick' });
    const result = await pickBackup(container);
    if (!result.ok) setState({ phase: 'error', error: result.error });
    else setState(result.value ? { phase: 'preview', picked: result.value } : { phase: 'idle' });
  }, [container]);

  const confirmRestore = useCallback(
    async (picked: PickedBackup) => {
      setState({ phase: 'working', action: 'restore' });
      const result = await restorePickedBackup(container, picked);
      setState(result.ok ? { phase: 'restored', ...result.value } : { phase: 'error', error: result.error });
    },
    [container],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  /** After a restore, asks for notification permission for the restored reminders (only when the learner taps). */
  const allowNotifications = useCallback(async () => {
    const allowed = await allowReminderNotifications(container);
    setState((s) => (s.phase === 'restored' ? { ...s, remindersNeedPermission: !allowed } : s));
    return allowed;
  }, [container]);

  return { state, runExport, runPick, confirmRestore, reset, allowNotifications };
}
