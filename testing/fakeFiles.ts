import type { BackupFileGateway } from '../data/backup/backupFiles';
import { ok } from '../shared/result';

/** In-memory stand-in for the device file picker and share sheet. */
export interface FakeFiles extends BackupFileGateway {
  readonly saved: { fileName: string; text: string }[];
  nextPick: string | null;
}

export function createFakeFiles(): FakeFiles {
  const fake: FakeFiles = {
    saved: [],
    nextPick: null,
    async saveAndShare(fileName, text) {
      fake.saved.push({ fileName, text });
      return ok({ uri: `file:///backups/${fileName}`, shared: true });
    },
    async pickText() {
      return ok(fake.nextPick);
    },
  };
  return fake;
}
