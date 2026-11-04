// Generates the app icons (PNG + SVG) into public/. Run: npx tsx tools/make-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [224, 40, 60];
const WHITE = [255, 255, 255];
const OUTLINE = [26, 26, 26];
const IRIS = [107, 74, 47];
const PUPIL = [17, 17, 17];

/** Color at normalized point (u, v) in [0,1]^2. `pad` shrinks the artwork (maskable safe zone). */
function shade(u: number, v: number, pad: number): number[] {
  const s = 1 - 2 * pad;
  const x = (u - 0.5) / s;
  const y = (v - 0.5) / s;
  // Almond eye: intersection of two circles.
  const a = 0.38;
  const b = 0.22;
  const R = (a * a + b * b) / (2 * b);
  const off = R - b;
  const d1 = Math.hypot(x, y - off);
  const d2 = Math.hypot(x, y + off);
  const inEye = Math.max(d1, d2) - R; // <0 inside
  const stroke = 0.028;
  if (inEye > stroke) return BG;
  if (inEye > -stroke) return OUTLINE;
  const r = Math.hypot(x, y);
  if (Math.hypot(x + 0.055, y + 0.055) < 0.035) return WHITE;
  if (r < 0.08) return PUPIL;
  if (r < 0.165) return IRIS;
  return WHITE;
}

function render(size: number, pad: number): Buffer {
  const SS = 4; // supersampling
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const c = shade((x + (i + 0.5) / SS) / size, (y + (j + 0.5) / SS) / size, pad);
          r += c[0]; g += c[1]; b += c[2];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(r / (SS * SS));
      raw[o + 1] = Math.round(g / (SS * SS));
      raw[o + 2] = Math.round(b / (SS * SS));
      raw[o + 3] = 255;
    }
  }
  return png(size, size, raw);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 0.06));
writeFileSync('public/icons/icon-512.png', render(512, 0.06));
writeFileSync('public/icons/maskable-512.png', render(512, 0.16));
writeFileSync('public/icons/apple-touch-icon.png', render(180, 0.08));
writeFileSync('public/favicon-32.png', render(32, 0.0));
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#e0283c"/><path d="M6 32 Q32 8 58 32 Q32 56 6 32Z" fill="#fff" stroke="#1a1a1a" stroke-width="3"/><circle cx="32" cy="32" r="10.5" fill="#6b4a2f"/><circle cx="32" cy="32" r="5" fill="#111"/><circle cx="28.5" cy="28.5" r="2.2" fill="#fff"/></svg>\n`,
);
console.log('icons written');
