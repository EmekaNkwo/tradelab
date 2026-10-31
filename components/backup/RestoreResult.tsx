import type { RestoreOutcome } from '../../features/backup';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { describeCounts } from './RestorePreview';

interface RestoreResultProps {
  readonly outcome: RestoreOutcome;
  /** Asks for notification permission; only called when the learner taps the button. */
  readonly onAllowNotifications: () => void;
}

/** What a restore did, and what still needs the learner (notification permission is never asked for on its own). */
export function RestoreResult({ outcome, onAllowNotifications }: RestoreResultProps) {
  return (
    <>
      <Notice live title="Restore complete" tone="success">
        <AppText>Restored {describeCounts(outcome.summary)}.</AppText>
        <AppText testID="restore-services-reset">
          Online services and the coach are off after a restore, with no data sharing allowed. Turn them on again in Data and AI services if you want them.
        </AppText>
        {outcome.stepNoticeTurnedOff ? (
          <AppText testID="restore-step-notice-off">The MetaTrader step notification is off, because this phone has not allowed notifications. Turn it on again from any MetaTrader task.</AppText>
        ) : null}
      </Notice>
      {outcome.remindersNeedPermission ? (
        <Notice live testID="restore-reminders-permission" title="Reminders need notifications" tone="warning">
          <AppText>Your restored learning reminders are on, but this phone has not allowed TradeLab to send notifications yet.</AppText>
          <Button label="Allow notifications" variant="secondary" onPress={onAllowNotifications} />
        </Notice>
      ) : null}
    </>
  );
}
