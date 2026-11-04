// Creating an eye region from a user tap.
import { pupilFromIris } from './pupil';
import { refineAt } from './refine';
import { DEFAULT_PARAMS, newId, type EyeRegion, type RGBAImage } from './types';

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
      return circle(img, iris.x, iris.y, Math.max(2, iris.irisR), DEFAULT_PARAMS.pupil);
    }
  }
  // 2) Red blob near the tap.
  const fit = refineAt(img, x, y, Math.max(6, touchR), { maxRadius: Math.max(4, touchR * 1.2), minRedness: 0.12 });
  if (fit && fit.redness - fit.ringRedness > 0.05) {
    // The red blob is the pupil: make the circle a bit larger so it reads as an iris.
    const rad = Math.max(2, Math.sqrt(fit.rx * fit.ry));
    return circle(img, fit.cx, fit.cy, rad / 0.8, 0.8);
  }
  // 3) Nothing obvious: a circle where the finger landed.
  return circle(img, x, y, Math.max(3, touchR * 0.5), DEFAULT_PARAMS.pupil);
}

/** Circular manual region. */
export function circle(_img: RGBAImage, cx: number, cy: number, r: number, pupil: number): EyeRegion {
  return { id: newId(), cx, cy, rx: r, ry: r, angle: 0, params: { ...DEFAULT_PARAMS, pupil }, source: 'manual' };
}
