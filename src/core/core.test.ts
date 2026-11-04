import { describe, expect, it } from 'vitest';
import { correctAll } from './correct';
import { redness } from './redness';
import { DEFAULT_PARAMS, type EyeRegion, type RGBAImage } from './types';
import { extractExif, insertExif, sanitizeExif } from '../lib/exif';

function solid(w: number, h: number, rgb: [number, number, number]): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { width: w, height: h, data };
}
const region = (cx: number, cy: number, r: number): EyeRegion => ({
  id: 'x', cx, cy, rx: r, ry: r, angle: 0, params: { ...DEFAULT_PARAMS }, source: 'manual',
});
const px = (img: RGBAImage, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));

describe('redness', () => {
  it('is high for red-eye pupils, low for skin and brown irises', () => {
    expect(redness(71, 23, 21)).toBeGreaterThan(0.6); // dull red pupil (film scan)
    expect(redness(200, 40, 40)).toBeGreaterThan(0.7); // vivid flash red
    expect(redness(200, 140, 105)).toBeLessThan(0.05); // skin
    expect(redness(62, 30, 13)).toBeLessThan(0.05); // brown iris
    expect(redness(120, 120, 120)).toBe(0); // gray
  });
});

describe('correction', () => {
  it('neutralises and darkens red inside the region', () => {
    const img = solid(40, 40, [180, 40, 40]);
    const out = correctAll(img, [region(20, 20, 10)]);
    const [r, g, b] = px(out, 20, 20);
    expect(Math.abs(r - g)).toBeLessThan(6);
    expect(Math.abs(g - b)).toBeLessThan(6);
    expect(r).toBeLessThan(60);
  });
  it('leaves pixels outside the region untouched', () => {
    const img = solid(40, 40, [180, 40, 40]);
    const out = correctAll(img, [region(20, 20, 5)]);
    expect(px(out, 2, 2)).toEqual([180, 40, 40]);
  });
  it('does not touch skin-coloured pixels even inside the region', () => {
    const img = solid(40, 40, [200, 140, 105]);
    const out = correctAll(img, [region(20, 20, 10)]);
    expect(px(out, 20, 20)).toEqual([200, 140, 105]);
  });
  it('strength 0 is a no-op', () => {
    const img = solid(20, 20, [180, 40, 40]);
    const r = region(10, 10, 6);
    r.params.strength = 0;
    expect(px(correctAll(img, [r]), 10, 10)).toEqual([180, 40, 40]);
  });
});

describe('exif', () => {
  // Minimal little-endian EXIF: IFD0 with Orientation=6, next-IFD pointer = 99 (fake thumbnail).
  function makeApp1(): Uint8Array {
    const tiff = [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, /* IFD0 */ 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 99, 0, 0, 0];
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const len = payload.length + 2;
    return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...payload]);
  }
  const jpeg = (extra: number[] = []) => new Uint8Array([0xff, 0xd8, ...extra, 0xff, 0xda, 0, 2, 0xff, 0xd9]);

  it('extracts, sanitizes and re-inserts EXIF', () => {
    const app1 = makeApp1();
    const src = jpeg(Array.from(app1));
    const found = extractExif(src)!;
    expect(found).toEqual(app1);
    const clean = sanitizeExif(found);
    const dv = new DataView(clean.buffer);
    expect(dv.getUint16(10 + 8 + 2 + 8, true)).toBe(1); // orientation value
    expect(dv.getUint32(10 + 8 + 2 + 12, true)).toBe(0); // thumbnail unlinked
    const out = insertExif(jpeg(), clean);
    expect(extractExif(out)).toEqual(clean);
  });
  it('returns null for non-JPEG or no EXIF', () => {
    expect(extractExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(extractExif(jpeg())).toBeNull();
  });
});
