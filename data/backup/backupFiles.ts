import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';

/** Device file access for backups. Kept thin; all logic lives in backupService. */
export interface BackupFileGateway {
  /** Saves a copy in app storage, then opens the share sheet so the learner can keep it elsewhere. */
  saveAndShare(fileName: string, text: string): Promise<Result<{ uri: string; shared: boolean }, AppError>>;
  /** Lets the learner pick a backup file. Returns null if they cancel. */
  pickText(): Promise<Result<string | null, AppError>>;
}

/** Larger than any realistic backup; protects against picking a huge unrelated file. */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export function createBackupFileGateway(): BackupFileGateway {
  return {
    async saveAndShare(fileName, text) {
      try {
        const dir = new Directory(Paths.document, 'backups');
        if (!dir.exists) dir.create({ intermediates: true });
        const file = new File(dir, fileName);
        if (!file.exists) file.create();
        await file.write(text);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your TradeLab backup' });
        }
        return ok({ uri: file.uri, shared: canShare });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Saving backup file failed', cause));
      }
    },
    async pickText() {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
        if (result.canceled) return ok(null);
        const asset = result.assets[0];
        if (!asset) return ok(null);
        if (asset.size !== undefined && asset.size > MAX_BACKUP_BYTES) {
          return err(validationError('The selected file is too large to be a TradeLab backup'));
        }
        const picked = new File(asset.uri);
        const text = await picked.text();
        // The picker copied the file into the cache; don't leave personal data lying there.
        try {
          if (picked.exists) picked.delete();
        } catch (cause) {
          logger.warn('Could not delete cached backup copy', { cause: String(cause) });
        }
        return ok(text);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading backup file failed', cause));
      }
    },
  };
}
