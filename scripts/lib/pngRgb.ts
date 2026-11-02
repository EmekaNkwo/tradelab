import { crc32, deflateSync } from 'node:zlib';

/**
 * Encodes RGBA pixels as an RGB PNG (colour type 2, no alpha channel), dropping alpha. App stores reject an app icon
 * with an alpha channel even when every pixel is opaque, and CanvasKit always encodes RGBA.
 */
export function encodeRgbPng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${rgba.length}`);
  const row = width * 3 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = y * row + 1 + x * 3;
      raw[to] = rgba[from]!;
      raw[to + 1] = rgba[from + 1]!;
      raw[to + 2] = rgba[from + 2]!;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}
