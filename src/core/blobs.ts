import { boxBlur3, redness } from './redness';
import { ringMean } from './refine';
import type { RGBAImage } from './types';

export interface BlobCandidate {
  /** Center and radius in full-resolution image pixels. */
  cx: number;
  cy: number;
  r: number;
  meanRed: number;
  ringRed: number;
  roundness: number;
  /** Heuristic score, higher = more pupil-like. */
  score: number;
  /** True if another candidate of similar size sits at a plausible eye distance. */
  paired: boolean;
}

export interface BlobOptions {
  /** Work resolution (longest side) for the scan. */
  workSize?: number;
  /** Largest pupil radius, as a fraction of the shorter image side. */
  maxRadiusFrac?: number;
  maxCandidates?: number;
}

/** Downscaled (area-averaged) redness map. */
export function reducedRednessMap(img: RGBAImage, f: number) {
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const out = new Float32Array(w * h);
  const { data, width } = img;
  const inv = 1 / (f * f);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let dy = 0; dy < f; dy++) {
        let p = ((y * f + dy) * width + x * f) * 4;
        for (let dx = 0; dx < f; dx++, p += 4) acc += redness(data[p], data[p + 1], data[p + 2]);
      }
      out[y * w + x] = acc * inv;
    }
  }
  return { map: boxBlur3(out, w, h), w, h };
}

/**
 * Face-independent scan for small, round, red blobs that stand out from their
 * surroundings. Multi-threshold so that both vivid and dull (brownish) red
 * pupils are found. Works on tiny pupils (radius ~1.5 px at work resolution).
 */
export function detectRedBlobs(img: RGBAImage, opts: BlobOptions = {}): BlobCandidate[] {
  const workSize = opts.workSize ?? 1600;
  const f = Math.max(1, Math.round(Math.max(img.width, img.height) / workSize));
  const { map: s, w, h } = reducedRednessMap(img, f);
  const maxR = Math.max(4, (opts.maxRadiusFrac ?? 0.035) * Math.min(w, h));
  const maxArea = Math.PI * maxR * maxR;

  const thresholds = [0.2, 0.27, 0.35, 0.45, 0.57];
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const raw: BlobCandidate[] = [];

  for (const thr of thresholds) {
    label.fill(0);
    let next = 1;
    for (let start = 0; start < w * h; start++) {
      if (label[start] || s[start] < thr) continue;
      const id = next++;
      let sp = 0;
      stack[sp++] = start;
      label[start] = id;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      let sum = 0;
      let minx = w;
      let maxx = 0;
      let miny = h;
      let maxy = 0;
      while (sp) {
        const k = stack[--sp];
        const x = k % w;
        const y = (k - x) / w;
        n++;
        if (n <= maxArea) {
          sx += x;
          sy += y;
          sxx += x * x;
          syy += y * y;
          sxy += x * y;
          sum += s[k];
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
        if (x > 0 && !label[k - 1] && s[k - 1] >= thr) { label[k - 1] = id; stack[sp++] = k - 1; }
        if (x < w - 1 && !label[k + 1] && s[k + 1] >= thr) { label[k + 1] = id; stack[sp++] = k + 1; }
        if (y > 0 && !label[k - w] && s[k - w] >= thr) { label[k - w] = id; stack[sp++] = k - w; }
        if (y < h - 1 && !label[k + w] && s[k + w] >= thr) { label[k + w] = id; stack[sp++] = k + w; }
      }
      if (n < 3 || n > maxArea) continue;

      const bw = maxx - minx + 1;
      const bh = maxy - miny + 1;
      const fill = n / (bw * bh);
      if (n >= 10 && fill < 0.4) continue;
      const mx = sx / n;
      const my = sy / n;
      const cxx = sxx / n - mx * mx + 1 / 12;
      const cyy = syy / n - my * my + 1 / 12;
      const cxy = sxy / n - mx * my;
      const tr = cxx + cyy;
      const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (cxx * cyy - cxy * cxy)));
      const elong = Math.sqrt((tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc));
      if (elong > 2.2) continue;
      const r = Math.sqrt(n / Math.PI);
      const meanRed = sum / n;
      const ringRed = ringMean(s, w, h, mx, my, r);
      const contrast = meanRed - ringRed;
      if (contrast < 0.1 || ringRed > meanRed * 0.65) continue;
      const roundness = 1 / elong;
      const score = contrast * Math.min(1, meanRed / 0.45) * (0.4 + 0.6 * roundness) * Math.min(1, fill / 0.7);
      raw.push({
        cx: (mx + 0.5) * f,
        cy: (my + 0.5) * f,
        r: r * f,
        meanRed,
        ringRed,
        roundness,
        score,
        paired: false,
      });
    }
  }

  // Non-maximum suppression across thresholds.
  raw.sort((a, b) => b.score - a.score);
  const kept: BlobCandidate[] = [];
  for (const c of raw) {
    let dup = false;
    for (const k of kept) {
      const d = Math.hypot(c.cx - k.cx, c.cy - k.cy);
      if (d < Math.max(c.r, k.r) * 1.3) {
        dup = true;
        break;
      }
    }
    if (!dup) kept.push(c);
  }

  // Eyes come in pairs of similar size at ~8-20 pupil diameters apart.
  for (const a of kept) {
    for (const b of kept) {
      if (a === b) continue;
      const ratio = Math.max(a.r, b.r) / Math.min(a.r, b.r);
      if (ratio > 2) continue;
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy) / (a.r + b.r);
      if (d >= 4 && d <= 26) {
        a.paired = true;
        break;
      }
    }
  }
  for (const c of kept) if (c.paired) c.score *= 1.35;
  kept.sort((a, b) => b.score - a.score);
  return kept.slice(0, opts.maxCandidates ?? 60);
}
