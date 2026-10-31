/**
 * The journal's device-file gateway, with the Expo pickers and file system
 * replaced by small fakes: cancel paths, size limits, private copies of
 * screenshots, and that only the app's own copies are ever deleted.
 */
import { createJournalFileGateway } from '../journalFiles';

interface FakeFileState {
  exists: boolean;
  size: number;
  bytes: Uint8Array;
  deleteThrows?: boolean;
}

const mockFiles = new Map<string, FakeFileState>();
const mockCopies: { from: string; to: string }[] = [];
const mockDeleted: string[] = [];
const mockDirs: string[] = [];

jest.mock('expo-file-system', () => {
  const pathOf = (parts: unknown[]): string =>
    parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    readonly uri: string;
    constructor(...parts: unknown[]) {
      this.uri = pathOf(parts);
    }
    get exists() {
      return mockDirs.includes(this.uri);
    }
    create() {
      mockDirs.push(this.uri);
    }
  }
  class File {
    readonly uri: string;
    constructor(...parts: unknown[]) {
      this.uri = pathOf(parts);
    }
    private get state() {
      return mockFiles.get(this.uri);
    }
    get exists() {
      return this.state?.exists ?? false;
    }
    get size() {
      return this.state?.size ?? 0;
    }
    async bytes() {
      return this.state?.bytes ?? new Uint8Array();
    }
    delete() {
      if (this.state?.deleteThrows) throw new Error('busy');
      mockDeleted.push(this.uri);
      mockFiles.delete(this.uri);
    }
    copy(target: { uri: string }) {
      mockCopies.push({ from: this.uri, to: target.uri });
    }
  }
  return { File, Directory, Paths: { document: 'file:///docs' } };
});

const mockGetDocument = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockGetDocument(...a) }));
const mockLaunchImages = jest.fn();
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...a: unknown[]) => mockLaunchImages(...a) }));

const utf8 = (s: string) => new TextEncoder().encode(s);

beforeEach(() => {
  mockFiles.clear();
  mockCopies.length = 0;
  mockDeleted.length = 0;
  mockDirs.length = 0;
  mockGetDocument.mockReset();
  mockLaunchImages.mockReset();
});

describe('pickStatement', () => {
  it('returns null when the learner cancels or picks nothing', async () => {
    const g = createJournalFileGateway();
    mockGetDocument.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await g.pickStatement()).toEqual({ ok: true, value: null });
    mockGetDocument.mockResolvedValueOnce({ canceled: false, assets: [] });
    expect(await g.pickStatement()).toEqual({ ok: true, value: null });
  });

  it('reads the picked file as text and deletes the cached copy', async () => {
    mockFiles.set('file:///cache/s.htm', { exists: true, size: 20, bytes: utf8('<html>closed</html>') });
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/s.htm', name: 's.htm', size: 20 }] });
    const r = await createJournalFileGateway().pickStatement();
    expect(r).toEqual({ ok: true, value: { name: 's.htm', text: '<html>closed</html>' } });
    expect(mockDeleted).toEqual(['file:///cache/s.htm']);
  });

  it('still returns the text when the cached copy cannot be deleted', async () => {
    mockFiles.set('file:///cache/s.htm', { exists: true, size: 5, bytes: utf8('hello'), deleteThrows: true });
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/s.htm', name: 's.htm' }] });
    const r = await createJournalFileGateway().pickStatement();
    expect(r.ok && r.value?.text).toBe('hello');
  });

  it('refuses a file over 5 MB, using the file size when the picker gives none', async () => {
    mockFiles.set('file:///cache/big.htm', { exists: true, size: 6 * 1024 * 1024, bytes: new Uint8Array() });
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/big.htm', name: 'big.htm' }] });
    const r = await createJournalFileGateway().pickStatement();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/too large/);
  });

  it('turns a picker failure into a storage error', async () => {
    mockGetDocument.mockRejectedValue(new Error('picker crashed'));
    const r = await createJournalFileGateway().pickStatement();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('StorageError');
  });
});

describe('pickScreenshot', () => {
  it('returns null when the learner cancels or picks nothing', async () => {
    const g = createJournalFileGateway();
    mockLaunchImages.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await g.pickScreenshot()).toEqual({ ok: true, value: null });
    mockLaunchImages.mockResolvedValueOnce({ canceled: false, assets: [] });
    expect(await g.pickScreenshot()).toEqual({ ok: true, value: null });
  });

  it('copies the image into the app’s own folder, keeping PNG as PNG', async () => {
    mockLaunchImages.mockResolvedValue({ canceled: false, assets: [{ uri: 'content://media/1', mimeType: 'image/png', fileSize: 1000 }] });
    const r = await createJournalFileGateway().pickScreenshot();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatch(/^file:\/\/\/docs\/journal-shots\/shot-\d+\.png$/);
    expect(mockDirs).toEqual(['file:///docs/journal-shots']);
    expect(mockCopies).toHaveLength(1);
    expect(mockCopies[0]!.from).toBe('content://media/1');
  });

  it('saves other image types as JPEG and reuses the existing folder', async () => {
    mockDirs.push('file:///docs/journal-shots');
    mockLaunchImages.mockResolvedValue({ canceled: false, assets: [{ uri: 'content://media/2', mimeType: 'image/jpeg' }] });
    const r = await createJournalFileGateway().pickScreenshot();
    if (r.ok) expect(r.value).toMatch(/\.jpg$/);
    expect(mockDirs).toHaveLength(1);
  });

  it('refuses an image over 15 MB', async () => {
    mockLaunchImages.mockResolvedValue({ canceled: false, assets: [{ uri: 'content://media/3', fileSize: 16 * 1024 * 1024 }] });
    const r = await createJournalFileGateway().pickScreenshot();
    expect(r.ok).toBe(false);
    expect(mockCopies).toHaveLength(0);
  });

  it('turns a copy failure into a storage error', async () => {
    mockLaunchImages.mockRejectedValue(new Error('no access'));
    const r = await createJournalFileGateway().pickScreenshot();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('StorageError');
  });
});

describe('deleteScreenshot', () => {
  it('deletes only the app’s own screenshot copies', async () => {
    mockFiles.set('file:///docs/journal-shots/shot-1.jpg', { exists: true, size: 1, bytes: new Uint8Array() });
    mockFiles.set('file:///docs/other/photo.jpg', { exists: true, size: 1, bytes: new Uint8Array() });
    const g = createJournalFileGateway();
    await g.deleteScreenshot('file:///docs/other/photo.jpg');
    await g.deleteScreenshot('file:///docs/journal-shots/missing.jpg');
    await g.deleteScreenshot('file:///docs/journal-shots/shot-1.jpg');
    expect(mockDeleted).toEqual(['file:///docs/journal-shots/shot-1.jpg']);
  });

  it('never throws when a delete fails', async () => {
    mockFiles.set('file:///docs/journal-shots/shot-2.jpg', { exists: true, size: 1, bytes: new Uint8Array(), deleteThrows: true });
    await expect(createJournalFileGateway().deleteScreenshot('file:///docs/journal-shots/shot-2.jpg')).resolves.toBeUndefined();
  });
});
