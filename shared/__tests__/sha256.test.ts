import { createHash } from 'crypto';
import { sha256 } from '../sha256';

describe('sha256', () => {
  it('matches the standard test vectors and Node’s implementation', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const s of ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'é ✓ 😀 £', 'x'.repeat(1000), '{"a":1}'.repeat(55)]) {
      expect(sha256(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});
