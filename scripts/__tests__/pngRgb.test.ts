import { inflateSync } from 'node:zlib';
import { encodeRgbPng } from '../lib/pngRgb';

describe('encodeRgbPng', () => {
  it('writes an RGB PNG with no alpha channel (colour type 2), as app stores require for the icon', () => {
    const png = encodeRgbPng(2, 1, new Uint8Array([10, 20, 30, 255, 40, 50, 60, 128]));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(2);
    const idat = png.indexOf('IDAT');
    const len = png.readUInt32BE(idat - 4);
    expect([...inflateSync(png.subarray(idat + 4, idat + 4 + len))]).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });

  it('refuses a pixel buffer of the wrong size', () => {
    expect(() => encodeRgbPng(2, 2, new Uint8Array(4))).toThrow(/Expected 16/);
  });
});
