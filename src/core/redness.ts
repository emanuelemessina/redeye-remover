import type { RGBAImage } from './types';

/**
 * Per-pixel redness in 0..1: how much red exceeds the strongest other channel,
 * relative to red. Very dark pixels are damped because film grain / sensor
 * noise makes their hue meaningless.
 */
export function redness(r: number, g: number, b: number): number {
  const m = g > b ? g : b;
  if (r <= m || r < 14) return 0;
  const s = (r - m) / r;
  // HSV hue (degrees) for a red-dominant pixel. Red-eye pupils sit at ~0-8°,
  // while skin, lips-in-shadow and brown irises are orange (~14-30°).
  const n = g < b ? g : b;
  const hue = (60 * (g - b)) / (r - n);
  let hueW: number;
  if (hue >= 0) hueW = hue <= 8 ? 1 : hue >= 18 ? 0 : 1 - (hue - 8) / 10;
  else hueW = hue >= -25 ? 1 : hue <= -45 ? 0 : 1 - (-hue - 25) / 20;
  const gate = r < 40 ? (r - 14) / 26 : 1;
  return s * hueW * gate;
}

/** Redness map of a sub-window, optionally box-blurred (radius 1) to tame grain. */
export function rednessMap(
  img: RGBAImage,
  x0: number,
  y0: number,
  w: number,
  h: number,
  blur = true,
): Float32Array {
  const { data, width } = img;
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let p = ((y0 + y) * width + x0) * 4;
    const row = y * w;
    for (let x = 0; x < w; x++, p += 4) {
      raw[row + x] = redness(data[p], data[p + 1], data[p + 2]);
    }
  }
  return blur ? boxBlur3(raw, w, h) : raw;
}

/** 3x3 box blur with clamped edges. */
export function boxBlur3(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = src[row + (x > 0 ? x - 1 : x)];
      const c = src[row + (x < w - 1 ? x + 1 : x)];
      tmp[row + x] = (a + src[row + x] + c) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      out[row + x] = (tmp[up + x] + tmp[row + x] + tmp[dn + x]) / 3;
    }
  }
  return out;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
