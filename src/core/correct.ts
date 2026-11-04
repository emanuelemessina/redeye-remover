import { redness, smoothstep } from './redness';
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
 * - pupil disc  → neutral (red removed) and darkened by `darkness`
 * - iris ring   → 'natural': red removed, iris kept; a colour: recoloured with
 *                 that iris tint, keeping the original light/dark texture
 * - catchlight  → small near-white reflections survive according to `shine`;
 *                 large bright/pink glare (a "white pupil") is treated as pupil
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
  // Soft edges never thinner than ~1 px, so small pupils don't look pixelated.
  const px1 = Math.min(0.5, 1 / rmin);
  const feather = Math.min(0.95, Math.max(p.feather, px1));
  const pupil = Math.min(1, Math.max(0.05, p.pupil));
  const pupilSoft = Math.max(0.1, px1);
  const n = b.w * b.h;
  const src8 = src.data;

  // Pass 1: geometry, catchlight candidates, iris brightness reference.
  const dist = new Float32Array(n).fill(2);
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
      if (d >= 1) continue;
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      const r = src8[i], g = src8[i + 1], bl = src8[i + 2];
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
  const dark = Math.min(1, Math.max(0, p.darkness));

  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const k = y * b.w + x;
      const i = ((b.y0 + y) * width + b.x0 + x) * 4;
      const r = src8[i], g = src8[i + 1], bl = src8[i + 2];
      const d = dist[k];
      const w = d >= 1 ? 0 : (1 - smoothstep(1 - feather, 1, d)) * p.strength;
      if (w <= 0.001) {
        if (src !== dst) {
          dst.data[i] = r;
          dst.data[i + 1] = g;
          dst.data[i + 2] = bl;
          dst.data[i + 3] = src8[i + 3];
        }
        continue;
      }
      // Pupil weight: 1 inside the pupil disc, 0 in the iris ring.
      const pw = pupil >= 0.999 ? 1 : 1 - smoothstep(pupil - pupilSoft, pupil + pupilSoft * 0.5, d);
      const keep = white[k] * keepK;

      // Pupil target: red-free luminance (mean of G,B), darkened; catchlight kept.
      const lumRF = (g + bl) * 0.5;
      const hl = (r + g + bl) / 3;
      const pv = lumRF * (1 - dark) * (1 - keep) + hl * keep;

      // Iris target.
      let ir: number, ig: number, ib: number;
      let irisW = 1;
      if (tint) {
        const luma = 0.3 * r + 0.59 * g + 0.11 * bl;
        // Radial iris profile: lighter mid-iris, darker limbal rim at the edge.
        const span = Math.max(0.05, 1 - pupil);
        const ti = Math.min(1, Math.max(0, (d - pupil) / span));
        const profile = 0.8 + 0.25 * Math.sin(Math.PI * Math.min(1, ti * 1.2)) - 0.3 * smoothstep(0.7, 1, ti);
        // Keep the photo's own texture (grain, fibres) around the tint.
        const tex = Math.min(1.3, Math.max(0.75, luma / irisRef));
        const k2 = profile * tex * 0.8;
        ir = tint[0] * k2;
        ig = tint[1] * k2;
        ib = tint[2] * k2;
        // Don't paint eyelid skin or the white of the eye that the circle overlaps.
        // (Red pixels are always replaced: bright red glow is what we're fixing.)
        irisW = Math.max(1 - smoothstep(irisRef * 1.3, irisRef * 1.8, luma), smoothstep(0.08, 0.3, redness(r, g, bl)));
      } else {
        // Natural: remove only true red (hue-gated), so brown/hazel irises
        // keep their colour while the red glow over them goes away.
        const m = Math.max(g, bl);
        const red = smoothstep(0.08, 0.3, redness(r, g, bl));
        ir = r > m ? r - (r - m) * 0.9 * red : r;
        ig = g;
        ib = bl;
      }
      if (irisW < 1) {
        ir = r + (ir - r) * irisW;
        ig = g + (ig - g) * irisW;
        ib = bl + (ib - bl) * irisW;
      }
      ir = ir * (1 - keep) + hl * keep;
      ig = ig * (1 - keep) + hl * keep;
      ib = ib * (1 - keep) + hl * keep;

      const tr = pv * pw + ir * (1 - pw);
      const tg = pv * pw + ig * (1 - pw);
      const tb = pv * pw + ib * (1 - pw);
      dst.data[i] = r + (tr - r) * w;
      dst.data[i + 1] = g + (tg - g) * w;
      dst.data[i + 2] = bl + (tb - bl) * w;
      dst.data[i + 3] = src8[i + 3];
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
