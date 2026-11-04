import { boxBlur3, redness, smoothstep } from './redness';
import { sensitivityToThreshold, type EyeRegion, type RGBAImage } from './types';

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
 * Removes red from one eye region. Reads from `src`, writes into `dst`
 * (may be the same image). Only pixels inside the region's bounding box change.
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

  // Redness threshold: sensitivity 0 -> only very red, 1 -> dull red too.
  const t0 = sensitivityToThreshold(p.sensitivity);
  const t1 = t0 + 0.14;

  const cos = Math.cos(region.angle);
  const sin = Math.sin(region.angle);
  // Tiny regions (low-res photos) get a proportionally harder edge, or the
  // feather would eat the whole pupil.
  const small = Math.min(1, Math.min(region.rx, region.ry) / 5);
  const feather = Math.min(0.95, Math.max(0, p.feather)) * small;
  const rx = Math.max(0.5, region.rx);
  const ry = Math.max(0.5, region.ry);

  // 1) raw mask = redness mask * radial falloff
  const mask = new Float32Array(b.w * b.h);
  for (let y = 0; y < b.h; y++) {
    const py = b.y0 + y + 0.5 - region.cy;
    for (let x = 0; x < b.w; x++) {
      const px = b.x0 + x + 0.5 - region.cx;
      const u = (px * cos + py * sin) / rx;
      const v = (-px * sin + py * cos) / ry;
      const d = Math.sqrt(u * u + v * v);
      if (d >= 1) continue;
      const radial = feather > 0 ? 1 - smoothstep(1 - feather, 1, d) : 1;
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      const s = redness(src.data[i], src.data[i + 1], src.data[i + 2]);
      mask[y * b.w + x] = smoothstep(t0, t1, s) * radial;
    }
  }
  // 2) smooth the mask a bit so film grain does not leave red speckles
  const m = b.w > 2 && b.h > 2 ? boxBlur3(mask, b.w, b.h) : mask;

  // 3) blend towards a neutral, darker pupil. Fully neutral gray (no G/B tint
  //    kept) so the pupil never turns greenish or teal next to warm skin.
  const darkK = 1 - 0.9 * p.darkness;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      const r = src.data[i];
      const g = src.data[i + 1];
      const bl = src.data[i + 2];
      const w = Math.min(1, m[y * b.w + x] * 1.25) * p.strength;
      if (w <= 0.001) {
        if (src !== dst) {
          dst.data[i] = r;
          dst.data[i + 1] = g;
          dst.data[i + 2] = bl;
          dst.data[i + 3] = src.data[i + 3];
        }
        continue;
      }
      const v = (g + bl) * 0.5 * darkK;
      dst.data[i] = r + (v - r) * w;
      dst.data[i + 1] = g + (v - g) * w;
      dst.data[i + 2] = bl + (v - bl) * w;
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
