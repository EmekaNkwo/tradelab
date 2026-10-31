import { decodeStatementBytes } from '../decodeText';

const utf8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

describe('decodeStatementBytes', () => {
  it('decodes UTF-8 with and without a BOM, including multi-byte characters', () => {
    expect(decodeStatementBytes(utf8('<td>Profit €</td>'))).toBe('<td>Profit €</td>');
    expect(decodeStatementBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('ok 😀')]))).toBe('ok 😀');
  });

  it('decodes UTF-16 little and big endian (MT4 often saves UTF-16)', () => {
    const le = Buffer.from('Closed Transactions', 'utf16le');
    expect(decodeStatementBytes(new Uint8Array([0xff, 0xfe, ...le]))).toBe('Closed Transactions');
    const be = Buffer.from(le).swap16();
    expect(decodeStatementBytes(new Uint8Array([0xfe, 0xff, ...be]))).toBe('Closed Transactions');
  });

  it('replaces invalid bytes instead of failing', () => {
    expect(decodeStatementBytes(new Uint8Array([0x61, 0xff, 0x62, 0xe2, 0x82]))).toBe('a�b��');
  });

  it('rejects overlong forms, surrogates and 0xF8+ lead bytes', () => {
    // C0 BC is an overlong "<"; ED A0 80 encodes a surrogate; F8 is never a lead byte.
    expect(decodeStatementBytes(new Uint8Array([0x61, 0xc0, 0xbc, 0x62]))).toBe('a\ufffd\ufffdb');
    expect(decodeStatementBytes(new Uint8Array([0x61, 0xed, 0xa0, 0x80]))).toBe('a\ufffd\ufffd\ufffd');
    expect(decodeStatementBytes(new Uint8Array([0xf8, 0x61]))).toBe('\ufffda');
  });

  it('recognises UTF-16 without a byte-order mark', () => {
    const le = [...'<html>'].flatMap((ch) => [ch.charCodeAt(0), 0]);
    expect(decodeStatementBytes(new Uint8Array(le))).toBe('<html>');
    expect(decodeStatementBytes(new Uint8Array([...'<p>'].flatMap((ch) => [0, ch.charCodeAt(0)])))).toBe('<p>');
  });

  it('handles large input', () => {
    expect(decodeStatementBytes(utf8('x'.repeat(100000)))).toHaveLength(100000);
  });
});
