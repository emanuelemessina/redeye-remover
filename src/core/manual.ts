// Creating an eye region from a user tap.
import { pupilFromIris } from './pupil';
import { refineAt } from './refine';
import { rednessMap } from './redness';
import { DEFAULT_PARAMS, newId, thresholdToSensitivity, type EyeRegion, type RGBAImage } from './types';

export interface KnownIris {
  x: number;
  y: number;
  irisR: number;
}

/**
 * Region for a tap at (x, y). `touchR` is the finger's uncertainty in image
 * pixels (depends on zoom). Uses known irises from auto-detection when the tap
 * is on one, otherwise looks for the red pupil around the tap.
 */
export function regionFromTap(img: RGBAImage, x: number, y: number, touchR: number, irises: KnownIris[]): EyeRegion {
  // 1) Tap on an eye we already know (detected but judged "not red enough").
  for (const iris of irises) {
    if (Math.hypot(iris.x - x, iris.y - y) <= Math.max(iris.irisR * 1.6, touchR * 0.6)) {
      const res = pupilFromIris(img, iris.x, iris.y, iris.irisR);
      if (res) return { ...res.region, source: 'manual' };
      return circle(img, iris.x, iris.y, Math.max(2, iris.irisR * 0.7));
    }
  }
  // 2) Red blob near the tap.
  const fit = refineAt(img, x, y, Math.max(6, touchR), { maxRadius: Math.max(4, touchR * 1.2), minRedness: 0.12 });
  if (fit && fit.redness - fit.ringRedness > 0.05) {
    const rad = Math.max(2, Math.sqrt(fit.rx * fit.ry));
    return circle(img, fit.cx, fit.cy, rad);
  }
  // 3) Nothing obvious: a circle where the finger landed.
  return circle(img, x, y, Math.max(3, touchR * 0.5));
}

/** Circular manual region with sensitivity tuned to the red inside it. */
export function circle(img: RGBAImage, cx: number, cy: number, r: number): EyeRegion {
  return {
    id: newId(),
    cx,
    cy,
    rx: r,
    ry: r,
    angle: 0,
    params: { ...DEFAULT_PARAMS, sensitivity: autoSensitivity(img, cx, cy, r) },
    source: 'manual',
  };
}

/** Sensitivity so the correction catches the red actually present in the circle. */
export function autoSensitivity(img: RGBAImage, cx: number, cy: number, r: number): number {
  const R = Math.ceil(r);
  const x0 = Math.max(0, Math.floor(cx - R));
  const y0 = Math.max(0, Math.floor(cy - R));
  const w = Math.min(img.width, Math.ceil(cx + R)) - x0;
  const h = Math.min(img.height, Math.ceil(cy + R)) - y0;
  if (w < 1 || h < 1) return DEFAULT_PARAMS.sensitivity;
  const s = rednessMap(img, x0, y0, w, h, r >= 4);
  const vals: number[] = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if (Math.hypot(x0 + i + 0.5 - cx, y0 + j + 0.5 - cy) <= r) vals.push(s[j * w + i]);
  if (!vals.length) return DEFAULT_PARAMS.sensitivity;
  vals.sort((a, b) => a - b);
  const p90 = vals[Math.floor(vals.length * 0.9)];
  if (p90 < 0.1) return DEFAULT_PARAMS.sensitivity;
  return thresholdToSensitivity(Math.max(0.06, Math.min(0.25, p90 * 0.4)));
}
