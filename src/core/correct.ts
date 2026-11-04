import { boxBlur3, redness, smoothstep } from './redness';
import { EYE_COLORS, type EyeRegion, type RGBAImage } from './types';

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
 * Corrects one eye. The circle is treated as the iris with a centred pupil:
 *
 * - pupil  → red removed and darkened by `darkness`, keeping the photo's grain
 *            and a hint of its natural tone, with a wide soft edge (no "painted disc")
 * - iris   → 'natural': only true red removed; a colour: a gentle tint that keeps
 *            the photo's own brightness and texture
 * - catchlight → small near-white reflections survive according to `shine`;
 *            large bright/pink glare (a "white pupil") is treated as pupil
 *
 * Nothing depends on an automatic pixel selection, so every control always acts.
 * Reads `src`, writes `dst` (may be the same image), only inside the bounding box.
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
  const rx = Math.max(0.5, region.rx);
  const ry = Math.max(0.5, region.ry);
  const rmin = Math.min(rx, ry);
  // Edges are never harder than ~1.5 px, so small pupils don't look pixelated.
  const px = Math.min(0.6, 1.5 / rmin);
  const feather = Math.min(0.95, Math.max(p.feather, px));
  const pupil = Math.min(1, Math.max(0.05, p.pupil));
  // Wide, smooth pupil/iris transition: real pupils have no hard outline.
  const pupilSoft = Math.max(0.2, px);
  const n = b.w * b.h;
  const S = src.data;

  // Pass 1: geometry, red-free luminance (for grain), catchlights, iris reference.
  const dist = new Float32Array(n).fill(2);
  const lum = new Float32Array(n);
  const white = new Float32Array(n);
  let pupilN = 0;
  let whiteN = 0;
  const irisLuma: number[] = [];
  for (let y = 0; y < b.h; y++) {
    const py = b.y0 + y + 0.5 - region.cy;
    for (let x = 0; x < b.w; x++) {
      const qx = b.x0 + x + 0.5 - region.cx;
      const u = (qx * cos + py * sin) / rx;
      const v = (-qx * sin + py * cos) / ry;
      const d = Math.sqrt(u * u + v * v);
      const k = y * b.w + x;
      dist[k] = d;
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      const r = S[i], g = S[i + 1], bl = S[i + 2];
      // Luminance with the red excess removed.
      const m = Math.max(g, bl);
      lum[k] = 0.3 * Math.min(r, m) + 0.59 * g + 0.11 * bl;
      if (d >= 1) continue;
      const mn = Math.min(r, g, bl);
      const mx = Math.max(r, g, bl);
      // Catchlight: bright in every channel and nearly colourless.
      const wv = smoothstep(150, 215, mn) * (1 - smoothstep(0.12, 0.3, (mx - mn) / Math.max(1, mx)));
      white[k] = wv;
      if (d < pupil) {
        pupilN++;
        if (wv > 0.5) whiteN++;
      } else {
        irisLuma.push(0.3 * r + 0.59 * g + 0.11 * bl);
      }
    }
  }
  // Typical pupil brightness (red-free); used to tell eyelid skin from pupil.
  const pupilLum: number[] = [];
  for (let k = 0; k < n; k++) if (dist[k] < pupil) pupilLum.push(lum[k]);
  pupilLum.sort((a, c) => a - c);
  const pupilRef = pupilLum.length ? pupilLum[Math.floor(pupilLum.length * 0.4)] : 0;
  // Local average luminance; the difference is film grain / fine detail.
  const lumBlur = b.w > 2 && b.h > 2 ? boxBlur3(lum, b.w, b.h) : lum;
  // A real catchlight is a small spot. If "white" covers a big part of the
  // pupil it is glare / a white pupil and gets darkened like the rest.
  const whiteFrac = pupilN ? whiteN / pupilN : 0;
  const glareK = whiteFrac > 0.15 ? 0.15 / whiteFrac : 1;
  const keepK = Math.min(1, Math.max(0, p.shine)) * glareK;
  irisLuma.sort((a, c) => a - c);
  // Typical iris brightness (lower percentile: eyelid skin / sclera inside the
  // circle are brighter and must not set the reference).
  const irisRef = irisLuma.length ? Math.max(20, irisLuma[Math.floor(irisLuma.length * 0.35)]) : 80;
  const tint = p.eyeColor !== 'natural' ? EYE_COLORS[p.eyeColor] : null;
  const tintL = tint ? 0.3 * tint[0] + 0.59 * tint[1] + 0.11 * tint[2] : 1;
  const amount = Math.min(1, Math.max(0, p.colorAmount ?? 0.5));
  const dark = Math.min(1, Math.max(0, p.darkness));

  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const k = y * b.w + x;
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      const r = S[i], g = S[i + 1], bl = S[i + 2];
      const d = dist[k];
      const w = d >= 1 ? 0 : (1 - smoothstep(1 - feather, 1, d)) * p.strength;
      if (w <= 0.001) {
        if (src !== dst) {
          dst.data[i] = r;
          dst.data[i + 1] = g;
          dst.data[i + 2] = bl;
          dst.data[i + 3] = S[i + 3];
        }
        continue;
      }
      let pw = pupil >= 0.98 ? 1 : 1 - smoothstep(pupil - pupilSoft, pupil + pupilSoft * 0.6, d);
      // Eyelids cover part of the pupil: skin-coloured pixels (orange hue,
      // clearly brighter than the pupil) are not darkened, so the dark area
      // follows the eye opening instead of being a perfect disc.
      if (pw > 0 && lum[k] > pupilRef + 25) {
        const mx = Math.max(r, g, bl);
        const mn = Math.min(r, g, bl);
        const sat = (mx - mn) / Math.max(1, mx);
        const hue = r >= g && r >= bl && mx > mn ? (60 * (g - bl)) / (mx - mn) : -1;
        const skin = hue < 0 ? 0 : smoothstep(9, 15, hue) * (1 - smoothstep(35, 50, hue)) * smoothstep(0.12, 0.22, sat);
        // (Eyelids only reach the outer part of the pupil.)
        pw *= 1 - skin * smoothstep(pupilRef + 25, pupilRef + 65, lum[k]) * smoothstep(0.55, 0.85, d / pupil);
      }
      const keep = white[k] * keepK;
      const m = Math.max(g, bl);
      const hl = (r + g + bl) / 3;

      // Pupil: red fully removed, brightness scaled down, grain kept.
      const nr = Math.min(r, m);
      const nl = Math.max(1, 0.3 * nr + 0.59 * g + 0.11 * bl);
      // Fine grain only: larger bright/dark spots are not grain (e.g. glare specks).
      const grain = Math.max(-12, Math.min(12, lum[k] - lumBlur[k]));
      const target = Math.max(0, lumBlur[k] * (1 - dark) + grain * (1 - 0.4 * dark));
      const sc = target / nl;
      // Mostly neutral with a hint of the pixel's own (non-red) tone.
      let pr = (nr * sc) * 0.6 + target * 0.4;
      let pg = (g * sc) * 0.6 + target * 0.4;
      let pb = (bl * sc) * 0.6 + target * 0.4;
      pr = pr * (1 - keep) + hl * keep;
      pg = pg * (1 - keep) + hl * keep;
      pb = pb * (1 - keep) + hl * keep;

      // Iris: remove only true red, then optionally tint.
      const red = smoothstep(0.08, 0.3, redness(r, g, bl));
      let ir = r > m ? r - (r - m) * 0.9 * red : r;
      let ig = g;
      let ib = bl;
      if (tint) {
        const L = 0.3 * ir + 0.59 * ig + 0.11 * ib;
        // Where red glow hid the iris, what's left is nearly black: lift it a
        // little towards a plausible iris brightness so the colour can show.
        const floor = 0.65 * tintL;
        const Lc = L < floor ? L + (floor - L) * 0.5 * amount : L;
        // Don't tint eyelid skin or the white of the eye that the circle overlaps.
        const irisW = (0.25 + 0.6 * amount) * (1 - smoothstep(irisRef * 1.3, irisRef * 1.8, L));
        ir += ((Lc * tint[0]) / tintL - ir) * irisW;
        ig += ((Lc * tint[1]) / tintL - ig) * irisW;
        ib += ((Lc * tint[2]) / tintL - ib) * irisW;
      }

      const tr = pr * pw + ir * (1 - pw);
      const tg = pg * pw + ig * (1 - pw);
      const tb = pb * pw + ib * (1 - pw);
      dst.data[i] = r + (tr - r) * w;
      dst.data[i + 1] = g + (tg - g) * w;
      dst.data[i + 2] = bl + (tb - bl) * w;
      dst.data[i + 3] = S[i + 3];
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
