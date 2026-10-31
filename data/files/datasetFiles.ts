import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { fromUnknown, validationError, type AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { err, ok, type Result } from '../../shared/result';
import { decodeStatementBytes } from './decodeText';

/** Device file access for price-data imports (spec §30): the learner picks a CSV file. Kept thin. */
export interface DatasetFileGateway {
  /** Lets the learner pick a CSV file. Returns null if they cancel. */
  pickCsv(): Promise<Result<{ readonly name: string; readonly text: string } | null, AppError>>;
}

/** Matches the parser's own limit (domain/marketData/csvImport.ts). */
const MAX_CSV_BYTES = 5 * 1024 * 1024;

export function createDatasetFileGateway(): DatasetFileGateway {
  return {
    async pickCsv() {
      try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true });
        if (result.canceled) return ok(null);
        const asset = result.assets[0];
        if (!asset) return ok(null);
        const picked = new File(asset.uri);
        if ((asset.size ?? picked.size) > MAX_CSV_BYTES) return err(validationError('The file is larger than 5 MB. Export a shorter period or a longer timeframe.'));
        const text = decodeStatementBytes(await picked.bytes());
        try {
          if (picked.exists) picked.delete();
        } catch (cause) {
          logger.warn('Could not delete cached CSV copy', { cause: String(cause) });
        }
        return ok({ name: asset.name, text });
      } catch (cause) {
        return err(fromUnknown('StorageError', 'Reading the file failed', cause));
      }
    },
  };
}
