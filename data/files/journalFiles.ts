import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { decodeStatementBytes } from './decodeText';

/** Device file access for the journal: MT statements and chart screenshots. Kept thin. */
export interface JournalFileGateway {
  /** Lets the learner pick an MT statement (HTML). Returns null if they cancel. */
  pickStatement(): Promise<Result<{ readonly name: string; readonly text: string } | null, AppError>>;
  /** Lets the learner pick a screenshot and keeps a private copy; returns its URI, or null if they cancel. */
  pickScreenshot(): Promise<Result<string | null, AppError>>;
  deleteScreenshot(uri: string): Promise<void>;
}

/** Statements are small; anything larger is not one. Matches the parser's own limit. */
const MAX_STATEMENT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;
const SHOTS_DIR = 'journal-shots';

export function createJournalFileGateway(): JournalFileGateway {
  return {
    async pickStatement() {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['text/html', 'application/xhtml+xml', 'text/plain', '*/*'], copyToCacheDirectory: true });
        if (result.canceled) return ok(null);
        const asset = result.assets[0];
        if (!asset) return ok(null);
        const picked = new File(asset.uri);
        // The picker does not always report a size; the file itself does, so nothing large is read into memory.
        if ((asset.size ?? picked.size) > MAX_STATEMENT_FILE_BYTES) {
          return err(validationError('The selected file is too large to be an account statement'));
        }
        const text = decodeStatementBytes(await picked.bytes());
        try {
          if (picked.exists) picked.delete();
        } catch (cause) {
          logger.warn('Could not delete cached statement copy', { cause: String(cause) });
        }
        return ok({ name: asset.name, text });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the statement failed', cause));
      }
    },

    async pickScreenshot() {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (result.canceled) return ok(null);
        const asset = result.assets[0];
        if (!asset) return ok(null);
        if (asset.fileSize !== undefined && asset.fileSize > MAX_SCREENSHOT_BYTES) return err(validationError('That image is too large'));
        const dir = new Directory(Paths.document, SHOTS_DIR);
        if (!dir.exists) dir.create({ intermediates: true });
        const source = new File(asset.uri);
        const extension = asset.mimeType === 'image/png' ? 'png' : 'jpg';
        const target = new File(dir, `shot-${Date.now()}.${extension}`);
        source.copy(target);
        return ok(target.uri);
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Attaching the screenshot failed', cause));
      }
    },

    async deleteScreenshot(uri) {
      try {
        const file = new File(uri);
        // Only ever delete our own copies.
        if (file.uri.includes(`/${SHOTS_DIR}/`) && file.exists) file.delete();
      } catch (cause) {
        logger.warn('Could not delete screenshot', { cause: String(cause) });
      }
    },
  };
}
