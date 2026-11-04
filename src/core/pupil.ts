import { rednessMap } from './redness';
import { DEFAULT_PARAMS, newId, thresholdToSensitivity, type EyeRegion, type RGBAImage } from './types';

export interface PupilResult {
  region: EyeRegion;
  /** High-percentile redness inside the iris. */
  red: number;
  /** Median redness around the iris (skin / sclera). */
  surround: number;
  /** 0..1 how sure we are this eye is red. */
  confidence: number;
}

/**
 * Given a known iris (center + radius), decides whether the pupil is red and
 * returns a correction region that covers the red part but stays inside the iris.
 */
export function pupilFromIris(img: RGBAImage, ix: number, iy: number, ir: number): PupilResult | null {
  const r = Math.max(1.5, ir);
  const R = Math.ceil(r * 2.1) + 1;
  const x0 = Math.max(0, Math.floor(ix - R));
  const y0 = Math.max(0, Math.floor(iy - R));
  const x1 = Math.min(img.width, Math.ceil(ix + R));
  const y1 = Math.min(img.height, Math.ceil(iy + R));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 3 || h < 3) return null;
  // Blur only when there are enough pixels; tiny irises would be washed out.
  const s = rednessMap(img, x0, y0, w, h, r >= 4);

  const inner: number[] = [];
  const ring: number[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const d = Math.hypot(x0 + i + 0.5 - ix, y0 + j + 0.5 - iy) / r;
      const v = s[j * w + i];
      if (d <= 0.9) inner.push(v);
      else if (d >= 1.35 && d <= 2.0) ring.push(v);
    }
  }
  if (inner.length < 3) return null;
  inner.sort((a, b) => a - b);
  ring.sort((a, b) => a - b);
  const p90 = inner[Math.min(inner.length - 1, Math.floor(inner.length * 0.9))];
  const surround = ring.length ? ring[Math.floor(ring.length / 2)] : 0;
  if (p90 < 0.12 || p90 - surround < 0.06) return null;

  // Red pixels inside the iris: centroid + area define the pupil region.
  const thr = Math.max(0.09, p90 * 0.45);
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = x0 + i + 0.5;
      const py = y0 + j + 0.5;
      if (Math.hypot(px - ix, py - iy) > r * 1.0) continue;
      const v = s[j * w + i];
      if (v < thr) continue;
      n++;
      sx += px * v;
      sy += py * v;
      sw += v;
    }
  }
  if (n === 0) return null;
  let cx = sx / sw;
  let cy = sy / sw;
  // Keep the region centred on the iris (the red blob may be lopsided by a catchlight).
  const off = Math.hypot(cx - ix, cy - iy);
  const maxOff = r * 0.35;
  if (off > maxOff) {
    cx = ix + ((cx - ix) * maxOff) / off;
    cy = iy + ((cy - iy) * maxOff) / off;
  }
  const rp = Math.sqrt(n / Math.PI);
  // At least ~2 px so tiny low-res pupils are fully covered.
  const rad = Math.max(2, Math.min(r * 1.0, Math.max(r * 0.6, rp * 1.35)));
  const confidence = Math.min(1, Math.max(0, (p90 - surround - 0.06) / 0.2) * 0.7 + Math.min(1, n / (Math.PI * r * r * 0.15)) * 0.3);
  return {
    region: {
      id: newId(),
      cx,
      cy,
      rx: rad,
      ry: rad,
      angle: 0,
      // Tune the threshold to this pupil: dull red needs a lower threshold.
      params: { ...DEFAULT_PARAMS, sensitivity: thresholdToSensitivity(Math.max(0.06, Math.min(0.25, p90 * 0.4))) },
      source: 'auto',
      confidence,
    },
    red: p90,
    surround,
    confidence,
  };
}
