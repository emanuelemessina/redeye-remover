import { rednessMap } from './redness';
import { DEFAULT_PARAMS, newId, type EyeRegion, type RGBAImage } from './types';

export interface PupilResult {
  region: EyeRegion;
  /** High-percentile (hue-gated) redness inside the iris. */
  red: number;
  /** Median redness around the iris (skin / sclera). */
  surround: number;
  /** Mean warm excess R - max(G,B) in the pupil core (catches dull brownish red-eye). */
  warm: number;
  /** Clearly red pixels (vivid red-eye). */
  isRed: boolean;
  /** 0..1 how sure we are this eye is red. */
  confidence: number;
}

/**
 * Given a known iris (center + radius), decides whether the pupil shows red-eye
 * and returns a pupil-sized correction region.
 *
 * Two signals: clearly red pixels (hue-gated redness, vivid flash red-eye), or a
 * warm-coloured pupil core (dull orange/brown red-eye of film scans, which has
 * the same hue as skin but sits where a healthy pupil is dark and neutral).
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
  let warmSum = 0;
  let coreR = 0;
  let coreN = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const d = Math.hypot(x0 + i + 0.5 - ix, y0 + j + 0.5 - iy) / r;
      const v = s[j * w + i];
      if (d <= 0.9) inner.push(v);
      else if (d >= 1.35 && d <= 2.0) ring.push(v);
      if (d <= 0.45) {
        const p = ((y0 + j) * img.width + x0 + i) * 4;
        const rr = img.data[p];
        warmSum += rr - Math.max(img.data[p + 1], img.data[p + 2]);
        coreR += rr;
        coreN++;
      }
    }
  }
  if (inner.length < 3 || !coreN) return null;
  inner.sort((a, b) => a - b);
  ring.sort((a, b) => a - b);
  const p90 = inner[Math.min(inner.length - 1, Math.floor(inner.length * 0.9))];
  const surround = ring.length ? ring[Math.floor(ring.length / 2)] : 0;
  const warm = warmSum / coreN;
  const meanCoreR = coreR / coreN;

  const isRed = p90 >= 0.12 && p90 - surround >= 0.06;
  // A healthy pupil is dark and neutral; a warm, not-too-dark core is red-eye.
  const isWarm = warm >= 18 && meanCoreR >= 50;
  if (!isRed && !isWarm) return null;

  // Size: area of red pixels when clearly red, else a typical dilated pupil.
  let rad = r * 0.62;
  let cx = ix;
  let cy = iy;
  if (isRed) {
    const thr = Math.max(0.09, p90 * 0.45);
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = x0 + i + 0.5;
        const py = y0 + j + 0.5;
        if (Math.hypot(px - ix, py - iy) > r) continue;
        const v = s[j * w + i];
        if (v < thr) continue;
        n++;
        sx += px * v;
        sy += py * v;
        sw += v;
      }
    }
    if (n > 0) {
      cx = sx / sw;
      cy = sy / sw;
      // Keep it centred on the iris (a catchlight can make the red blob lopsided).
      const off = Math.hypot(cx - ix, cy - iy);
      const maxOff = r * 0.25;
      if (off > maxOff) {
        cx = ix + ((cx - ix) * maxOff) / off;
        cy = iy + ((cy - iy) * maxOff) / off;
      }
      rad = Math.sqrt(n / Math.PI) * 1.25;
    }
  }
  // Pupil-sized: never the whole iris (that gives "doll eyes"), at least 2 px.
  // Vivid red may fill the whole iris; a dull warm pupil is kept pupil-sized.
  rad = Math.max(2, Math.min(r * (isRed ? 1.0 : 0.8), Math.max(r * 0.5, rad)));

  const redConf = Math.min(1, Math.max(0, (p90 - surround - 0.06) / 0.2));
  const warmConf = Math.min(1, Math.max(0, (warm - 18) / 25));
  const confidence = Math.max(isRed ? 0.5 + 0.5 * redConf : 0, isWarm ? 0.4 + 0.5 * warmConf : 0);
  return {
    region: {
      id: newId(),
      cx,
      cy,
      rx: rad,
      ry: rad,
      angle: 0,
      params: { ...DEFAULT_PARAMS },
      source: 'auto',
      confidence,
    },
    red: p90,
    surround,
    warm,
    isRed,
    confidence,
  };
}
