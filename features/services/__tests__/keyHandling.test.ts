import { REDACTED, redactText } from '../../../shared/redact';
import { createTestHarness, type TestHarness } from '../../../testing/harness';
import { deleteSecret } from '../secrets';

/** Review findings J (L6, security L6). */

let h: TestHarness;
beforeEach(async () => {
  h = await createTestHarness();
});
afterEach(() => h.db.close());

async function integrations() {
  const s = await h.container.settings.get();
  if (!s.ok) throw new Error(s.error.message);
  return s.value.integrations;
}

describe('deleting a key', () => {
  it('turns the service off even when the key cannot be deleted, and says the delete failed', async () => {
    await h.container.secrets.set('twelvedata_api_key', 'td-secret-key-0123456789');
    await h.container.settings.update({ integrations: { ...(await integrations()), marketProvider: true } }, '2026-10-30T10:00:00.000Z' as never);
    h.secrets.deleteFails = true;
    const r = await deleteSecret(h.container, 'twelvedata_api_key');
    expect(!r.ok && r.error.learnerText).toMatch(/turned off, but the key could not be deleted/);
    expect((await integrations()).marketProvider).toBe(false);
    expect(h.secrets.values.has('twelvedata_api_key')).toBe(true);
  });

  it('leaves the key in place when the service cannot be turned off first', async () => {
    await h.container.secrets.set('anthropic_api_key', 'sk-ant-0123456789abcdef');
    const original = h.container.settings.update;
    (h.container.settings as { update: typeof original }).update = async () => ({ ok: false, error: { kind: 'StorageError', message: 'disk full' } });
    expect((await deleteSecret(h.container, 'anthropic_api_key')).ok).toBe(false);
    expect(h.secrets.values.has('anthropic_api_key')).toBe(true);
    (h.container.settings as { update: typeof original }).update = original;
  });
});

describe('log redaction', () => {
  it('masks key= tokens and "API key:" values', () => {
    expect(redactText('GET /x?symbol=A&key=abcdefghijklmnop1234')).toBe(`GET /x?symbol=A&key=${REDACTED}`);
    expect(redactText('Your API key: abcd1234efgh5678 is invalid')).toBe(`Your API key: ${REDACTED} is invalid`);
    expect(redactText('key=short')).toBe('key=short');
  });

});
