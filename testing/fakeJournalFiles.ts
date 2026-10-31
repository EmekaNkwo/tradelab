import type { JournalFileGateway } from '../data/files/journalFiles';
import { ok } from '../shared/result';

/** Test-only journal file gateway: tests queue the statement and screenshot each pick returns. */
export interface FakeJournalFiles extends JournalFileGateway {
  nextStatement: { name: string; text: string } | null;
  nextScreenshot: string | null;
  readonly deleted: string[];
}

export function createFakeJournalFiles(): FakeJournalFiles {
  const fake: FakeJournalFiles = {
    nextStatement: null,
    nextScreenshot: null,
    deleted: [],
    pickStatement: async () => ok(fake.nextStatement),
    pickScreenshot: async () => ok(fake.nextScreenshot),
    deleteScreenshot: async (uri) => {
      fake.deleted.push(uri);
    },
  };
  return fake;
}
