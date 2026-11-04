import { rednessMap } from './redness';
import type { RGBAImage } from './types';

export interface FittedEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  /** Mean redness inside the fitted blob (0 if nothing red was found). */
  redness: number;
  /** Mean redness in a ring just outside the blob. */
  ringRedness: number;
  area: number;
}

/**
 * Finds the red pupil around (x, y) within `radius` px and fits an ellipse.
 * Used for taps, for refining face-landmark iris positions, and for blob
 * candidates. Returns null if there is no clearly red blob near the point.
 */
export function refineAt(
  img: RGBAImage,
  x: number,
  y: number,
  radius: number,
  opts: { maxRadius?: number; minRedness?: number } = {},
): FittedEllipse | null {
  const R = Math.max(4, Math.ceil(radius));
  const x0 = Math.max(0, Math.floor(x - R));
  const y0 = Math.max(0, Math.floor(y - R));
  const x1 = Math.min(img.width, Math.ceil(x + R + 1));
  const y1 = Math.min(img.height, Math.ceil(y + R + 1));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 3 || h < 3) return null;
  const s = rednessMap(img, x0, y0, w, h, true);

  // Seed: the reddest pixel, preferring ones close to the requested point.
  const lx = x - x0;
  const ly = y - y0;
  let best = -1;
  let bestV = -1;
  const R2 = R * R;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = i - lx;
      const dy = j - ly;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      const v = s[j * w + i] * (1 - 0.35 * (d2 / R2));
      if (v > bestV) {
        bestV = v;
        best = j * w + i;
      }
    }
  }
  const minRed = opts.minRedness ?? 0.18;
  if (best < 0 || s[best] < minRed) return null;
  const peak = s[best];

  // Region grow from seed over pixels above an adaptive threshold.
  const thr = Math.max(minRed * 0.75, peak * 0.45);
  const visited = new Uint8Array(w * h);
  const stack = [best];
  visited[best] = 1;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sumS = 0;
  const maxArea = w * h * 0.6;
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % w;
    const j = (k - i) / w;
    n++;
    sx += i;
    sy += j;
    sxx += i * i;
    syy += j * j;
    sxy += i * j;
    sumS += s[k];
    if (n > maxArea) return null; // leaked into a big red area (skin, lips)
    if (i > 0) push(k - 1);
    if (i < w - 1) push(k + 1);
    if (j > 0) push(k - w);
    if (j < h - 1) push(k + w);
  }
  function push(k: number) {
    if (!visited[k] && s[k] >= thr) {
      visited[k] = 1;
      stack.push(k);
    }
  }

  const mx = sx / n;
  const my = sy / n;
  const cxx = sxx / n - mx * mx + 1 / 12;
  const cyy = syy / n - my * my + 1 / 12;
  const cxy = sxy / n - mx * my;
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(1e-6, tr / 2 - disc);
  // Uniform ellipse: variance along axis = a^2 / 4. Grow a bit to cover the soft fringe.
  const grow = 1.3;
  let rx = 2 * Math.sqrt(l1) * grow;
  let ry = 2 * Math.sqrt(l2) * grow;
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  // Pupils are round; strongly elongated fits are clipped toward a circle.
  if (rx > ry * 1.6) rx = ry * 1.6;
  const maxR = opts.maxRadius ?? R;
  rx = Math.min(rx, maxR);
  ry = Math.min(ry, maxR);
  rx = Math.max(rx, 1.5);
  ry = Math.max(ry, 1.5);

  const cx = x0 + mx + 0.5;
  const cy = y0 + my + 0.5;
  const ring = ringMean(s, w, h, mx, my, Math.sqrt(rx * ry) / grow);
  return { cx, cy, rx, ry, angle, redness: sumS / n, ringRedness: ring, area: n };
}

/** Mean of map values on circles at 1.6x..2.6x the given radius. */
export function ringMean(
  s: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
): number {
  let sum = 0;
  let cnt = 0;
  for (const k of [1.6, 2.1, 2.6]) {
    const rr = Math.max(2, r * k);
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      const i = Math.round(cx + rr * Math.cos(t));
      const j = Math.round(cy + rr * Math.sin(t));
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      sum += s[j * w + i];
      cnt++;
    }
  }
  return cnt ? sum / cnt : 0;
}
