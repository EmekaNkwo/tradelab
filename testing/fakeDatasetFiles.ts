import type { DatasetFileGateway } from '../data/files/datasetFiles';
import { ok } from '../shared/result';

/** Test-only CSV picker: tests queue the file the next pick returns. */
export interface FakeDatasetFiles extends DatasetFileGateway {
  nextCsv: { name: string; text: string } | null;
}

export function createFakeDatasetFiles(): FakeDatasetFiles {
  const fake: FakeDatasetFiles = { nextCsv: null, pickCsv: async () => ok(fake.nextCsv) };
  return fake;
}
