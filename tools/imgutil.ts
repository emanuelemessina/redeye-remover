// Node-only helpers for the evaluation tools (not shipped in the app).
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import type { RGBAImage } from '../src/core/types';

export function loadJpeg(path: string): RGBAImage {
  const raw = jpeg.decode(readFileSync(path), { useTArray: true, maxMemoryUsageInMB: 2048 });
  return { width: raw.width, height: raw.height, data: raw.data };
}

export function saveJpeg(path: string, img: RGBAImage, quality = 88) {
  const out = jpeg.encode({ width: img.width, height: img.height, data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength) }, quality);
  writeFileSync(path, out.data);
}

export function blank(width: number, height: number, v = 255): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(v);
  return { width, height, data };
}

export function crop(img: RGBAImage, x0: number, y0: number, w: number, h: number): RGBAImage {
  const out = blank(w, h, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, x0 + x));
      const sy = Math.min(img.height - 1, Math.max(0, y0 + y));
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

/** Nearest-neighbour resize (fine for debug sheets). */
export function resize(img: RGBAImage, w: number, h: number): RGBAImage {
  const out = blank(w, h, 0);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / w));
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

export function paste(dst: RGBAImage, src: RGBAImage, x0: number, y0: number) {
  for (let y = 0; y < src.height; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const di = (dy * dst.width + dx) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
    }
  }
}

export function circle(img: RGBAImage, cx: number, cy: number, r: number, rgb: [number, number, number], thick = 2) {
  const steps = Math.max(24, Math.ceil(r * 8));
  for (let t = 0; t < thick; t++) {
    const rr = r + t;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + rr * Math.cos(a));
      const y = Math.round(cy + rr * Math.sin(a));
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const di = (y * img.width + x) * 4;
      img.data[di] = rgb[0];
      img.data[di + 1] = rgb[1];
      img.data[di + 2] = rgb[2];
    }
  }
}

/** Tiny 3x5 digit font for labelling debug crops. */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
export function label(img: RGBAImage, text: string, x0: number, y0: number, scale = 3, rgb: [number, number, number] = [255, 255, 0]) {
  let x = x0;
  for (const ch of text) {
    const d = DIGITS[Number(ch)];
    if (d) {
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 3; i++)
          if (d[j * 3 + i] === '1')
            for (let sy = 0; sy < scale; sy++)
              for (let sx = 0; sx < scale; sx++) {
                const px = x + i * scale + sx;
                const py = y0 + j * scale + sy;
                if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
                const di = (py * img.width + px) * 4;
                img.data[di] = rgb[0];
                img.data[di + 1] = rgb[1];
                img.data[di + 2] = rgb[2];
              }
    }
    x += 4 * scale;
  }
}
