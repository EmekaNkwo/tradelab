import { createFakeFiles } from '../../../testing/fakeFiles';
import { createTestHarness } from '../../../testing/testContainer';
import { err } from '../../../shared/result';
import { storageError } from '../../../shared/errors';
import { exportBackup } from '../useCases';

describe('exportBackup', () => {
  it('reports success when the file was saved even if recording the time fails', async () => {
    const harness = await createTestHarness(createFakeFiles());
    const settings = { ...harness.container.settings, update: async () => err(storageError('disk full')) };
    const result = await exportBackup({ ...harness.container, settings });
    expect(result.ok).toBe(true);
    expect(harness.files.saved).toHaveLength(1);
    harness.db.close();
  });

  it('reports failure when the file could not be saved', async () => {
    const files = { ...createFakeFiles(), saveAndShare: async () => err(storageError('no space')) };
    const harness = await createTestHarness();
    const result = await exportBackup({ ...harness.container, backupFiles: files });
    expect(!result.ok && result.error.kind).toBe('StorageError');
    harness.db.close();
  });
});
