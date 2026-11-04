import { smoothstep } from './redness';
import type { EyeRegion, RGBAImage } from './types';

/** Integer bounding box of a rotated ellipse, clamped to the image. */
export function regionBounds(r: EyeRegion, width: number, height: number) {
  const c = Math.cos(r.angle);
  const s = Math.sin(r.angle);
  const hw = Math.sqrt(r.rx * r.rx * c * c + r.ry * r.ry * s * s);
  const hh = Math.sqrt(r.rx * r.rx * s * s + r.ry * r.ry * c * c);
  const x0 = Math.max(0, Math.floor(r.cx - hw - 1));
  const y0 = Math.max(0, Math.floor(r.cy - hh - 1));
  const x1 = Math.min(width, Math.ceil(r.cx + hw + 1));
  const y1 = Math.min(height, Math.ceil(r.cy + hh + 1));
  return { x0, y0, x1, y1, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Corrects one pupil, the way photo editors do: inside the (feathered) circle
 * every pixel becomes neutral (red removed) and is darkened, except bright
 * catchlights, which keep their brightness. Reads `src`, writes `dst` (may be
 * the same image). Only pixels inside the region's bounding box change.
 *
 * - strength: blend between original (0) and corrected (1)
 * - darkness: 0 = only remove the colour, 1 = pupil goes black
 * - feather:  softness of the edge (fraction of the radius)
 */
export function correctRegion(src: RGBAImage, dst: RGBAImage, region: EyeRegion): void {
  const { width, height } = src;
  const b = regionBounds(region, width, height);
  if (b.w === 0 || b.h === 0) return;
  const p = region.params;
  if (p.strength <= 0) {
    if (src !== dst) copyBox(src, dst, b.x0, b.y0, b.w, b.h);
    return;
  }

  const cos = Math.cos(region.angle);
  const sin = Math.sin(region.angle);
  // Soft edge as a fraction of the radius, but never less than ~1 px so small
  // (low-res) pupils don't look like hard pixelated dots.
  const rmin = Math.max(0.5, Math.min(region.rx, region.ry));
  const feather = Math.min(0.95, Math.max(Math.max(0, p.feather), Math.min(0.5, 1 / rmin)));
  const rx = Math.max(0.5, region.rx);
  const ry = Math.max(0.5, region.ry);
  const n = b.w * b.h;

  // Pass 1: normalized distance + red-free luminance (mean of G and B: a red
  // pupil is dark in those channels, a catchlight is bright in all).
  const dist = new Float32Array(n).fill(2);
  const lum = new Float32Array(n);
  const inner: number[] = [];
  for (let y = 0; y < b.h; y++) {
    const py = b.y0 + y + 0.5 - region.cy;
    for (let x = 0; x < b.w; x++) {
      const px = b.x0 + x + 0.5 - region.cx;
      const u = (px * cos + py * sin) / rx;
      const v = (-px * sin + py * cos) / ry;
      const d = Math.sqrt(u * u + v * v);
      const k = y * b.w + x;
      dist[k] = d;
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      lum[k] = (src.data[i + 1] + src.data[i + 2]) * 0.5;
      if (d < 0.8) inner.push(lum[k]);
    }
  }
  // Typical pupil brightness; much brighter pixels are catchlights.
  inner.sort((a, c) => a - c);
  const ref = inner.length ? inner[Math.floor(inner.length * 0.4)] : 0;
  const hl0 = ref + 25;
  const hl1 = ref + 75;
  const dark = Math.min(1, Math.max(0, p.darkness));

  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const k = y * b.w + x;
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      const r = src.data[i];
      const g = src.data[i + 1];
      const bl = src.data[i + 2];
      const d = dist[k];
      const w = d >= 1 ? 0 : (feather > 0 ? 1 - smoothstep(1 - feather, 1, d) : 1) * p.strength;
      if (w <= 0.001) {
        if (src !== dst) {
          dst.data[i] = r;
          dst.data[i + 1] = g;
          dst.data[i + 2] = bl;
          dst.data[i + 3] = src.data[i + 3];
        }
        continue;
      }
      // Catchlights are darkened much less, so they stay but don't glare.
      const highlight = smoothstep(hl0, hl1, lum[k]);
      const target = lum[k] * (1 - dark * (1 - 0.65 * highlight));
      dst.data[i] = r + (target - r) * w;
      dst.data[i + 1] = g + (target - g) * w;
      dst.data[i + 2] = bl + (target - bl) * w;
      dst.data[i + 3] = src.data[i + 3];
    }
  }
}

function copyBox(src: RGBAImage, dst: RGBAImage, x0: number, y0: number, w: number, h: number) {
  for (let y = 0; y < h; y++) {
    const start = ((y0 + y) * src.width + x0) * 4;
    dst.data.set(src.data.subarray(start, start + w * 4), start);
  }
}

/** Applies all regions to a copy of `src` and returns it. */
export function correctAll(src: RGBAImage, regions: EyeRegion[]): RGBAImage {
  const out: RGBAImage = {
    width: src.width,
    height: src.height,
    data: new Uint8ClampedArray(src.data),
  };
  // Sequential in-place so overlapping regions compose instead of overwriting.
  for (const r of regions) correctRegion(out, out, r);
  return out;
}

/** Integer box covering a region, used to cut out patches. */
export interface Box {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/**
 * Corrected pixels for the bounding box of `target`, with every region that
 * touches the box applied. Only reads `src`; returns a small RGBA patch.
 */
export function correctedPatch(src: RGBAImage, target: EyeRegion, all: EyeRegion[]): { box: Box; patch: RGBAImage } {
  const b = regionBounds(target, src.width, src.height);
  const box = { x0: b.x0, y0: b.y0, w: b.w, h: b.h };
  const data = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const s = ((box.y0 + y) * src.width + box.x0) * 4;
    data.set(src.data.subarray(s, s + box.w * 4), y * box.w * 4);
  }
  const patch: RGBAImage = { width: box.w, height: box.h, data };
  for (const r of all) {
    const rb = regionBounds(r, src.width, src.height);
    if (rb.x1 <= box.x0 || rb.x0 >= box.x0 + box.w || rb.y1 <= box.y0 || rb.y0 >= box.y0 + box.h) continue;
    correctRegion(patch, patch, { ...r, cx: r.cx - box.x0, cy: r.cy - box.y0 });
  }
  return { box, patch };
}
