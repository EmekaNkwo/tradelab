import { hasProfile, type BackupSummary, type PickedBackup } from '../../features/backup';
import { formatInTimeZone } from '../../shared/time';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { TriangleAlert } from '../ui/icons';

export function describeCounts(summary: BackupSummary): string {
  const total = Object.values(summary.rowCounts).reduce((a, b) => a + b, 0);
  return `${total} saved item${total === 1 ? '' : 's'}`;
}

interface RestorePreviewProps {
  readonly picked: PickedBackup;
  readonly timeZone: string;
  readonly onConfirm: (picked: PickedBackup) => void;
  readonly onCancel: () => void;
  /** Inside another card (onboarding's restore card): a tile, so it is not a card nested in a card. */
  readonly inCard?: boolean;
}

/** What a picked backup holds, and a confirm step before it replaces the data on this phone. */
export function RestorePreview({ picked, timeZone, onConfirm, onCancel, inCard = false }: RestorePreviewProps) {
  return (
    <Card accent="warning" variant={inCard ? 'tile' : 'card'} testID="restore-preview">
      <CardHeader icon={TriangleAlert} tone="warning" title="Restore this backup?" />
      <AppText>
        Made {formatInTimeZone(picked.summary.createdAt, timeZone)} with app {picked.summary.appVersion}.
      </AppText>
      <AppText>Contains {describeCounts(picked.summary)}.</AppText>
      {!hasProfile(picked.summary) ? (
        <AppText color="warning" testID="restore-no-profile">
          {"This backup is from a phone that hadn't finished setup. After restoring it you will be asked the setup questions again."}
        </AppText>
      ) : null}
      <AppText color="warning">Your current data on this phone will be replaced. This cannot be undone.</AppText>
      <Button label="Replace my data" variant="danger" onPress={() => onConfirm(picked)} />
      <Button label="Cancel" variant="secondary" onPress={onCancel} />
    </Card>
  );
}
