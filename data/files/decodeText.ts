/**
 * Decodes a statement file. MetaTrader 4 often saves statements as UTF-16
 * (little-endian, with a byte-order mark); others are UTF-8. UTF-16 without a
 * mark is recognised by its zero bytes around the leading "<". Pure, so it is
 * testable without a device.
 */
export function decodeStatementBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return decodeUtf16(bytes.subarray(2), true);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return decodeUtf16(bytes.subarray(2), false);
  // No byte-order mark: an HTML file starts with "<" (or whitespace), so UTF-16 shows a zero byte beside it.
  if (bytes.length >= 2 && bytes[0] !== 0 && bytes[1] === 0) return decodeUtf16(bytes, true);
  if (bytes.length >= 2 && bytes[0] === 0 && bytes[1] !== 0) return decodeUtf16(bytes, false);
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return decodeUtf8(bytes.subarray(start));
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const units: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const a = bytes[i] as number;
    const b = bytes[i + 1] as number;
    units.push(littleEndian ? a | (b << 8) : (a << 8) | b);
  }
  return chunked(units);
}

/** Smallest code point for a sequence with `need` continuation bytes; anything lower is overlong. */
const MIN_CODE_POINT: readonly number[] = [0, 0x80, 0x800, 0x10000];

function decodeUtf8(bytes: Uint8Array): string {
  const points: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] as number;
    // 0xF8 and above never start a valid UTF-8 sequence.
    const need = b < 0x80 ? 0 : b >= 0xf8 ? -1 : b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : -1;
    if (need < 0) {
      points.push(0xfffd);
      i += 1;
      continue;
    }
    let cp = need === 0 ? b : b & (0x3f >> need);
    let valid = true;
    for (let k = 1; k <= need; k += 1) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      cp = (cp << 6) | (next & 0x3f);
    }
    // Overlong forms, UTF-16 surrogates, and code points past U+10FFFF are invalid.
    if (valid && (cp < (MIN_CODE_POINT[need] ?? 0) || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff)) valid = false;
    if (!valid) {
      points.push(0xfffd);
      i += 1;
      continue;
    }
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      points.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else points.push(cp);
    i += need + 1;
  }
  return chunked(points);
}

/** String.fromCharCode in chunks, so large files don't overflow the argument limit. */
function chunked(units: readonly number[]): string {
  let out = '';
  for (let i = 0; i < units.length; i += 8192) out += String.fromCharCode(...units.slice(i, i + 8192));
  return out;
}
