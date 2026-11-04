// Automatic red-eye detection:
//   1. faces via MediaPipe BlazeFace over tiles + rotations (finds small / sideways faces)
//   2. precise irises via MediaPipe Face Landmarker on an upright crop of each face
//   3. per-iris pupil analysis decides "red or not" and sizes the correction region
import { scanFaces, type DetectedFace, type ScanOptions } from './faces';
import { irisesFor, type Iris } from './landmarks';
import { pupilFromIris } from './pupil';
import type { EyeRegion, RGBAImage } from './types';

export interface DetectOptions extends ScanOptions {
  /** Faces scoring at least this are trusted without further evidence. */
  trustedFaceScore?: number;
}

export interface DetectedEyeInfo {
  face: number;
  x: number;
  y: number;
  irisR: number;
  openness: number;
  red: number;
  surround: number;
  region: EyeRegion | null;
}

export interface DetectResult {
  regions: EyeRegion[];
  faces: DetectedFace[];
  /** Every eye that was examined (for debugging / UI hints). */
  eyes: DetectedEyeInfo[];
}

export async function detectRedEyes(
  img: RGBAImage,
  source: CanvasImageSource,
  opts: DetectOptions = {},
): Promise<DetectResult> {
  const faces = await scanFaces(source, img.width, img.height, {
    minScore: 0.6,
    ...opts,
    // Face scan = first 85% of the progress bar, iris landmarks = the rest.
    onProgress: (p) => opts.onProgress?.(p * 0.85),
  });
  const trusted = opts.trustedFaceScore ?? 0.78;
  const regions: EyeRegion[] = [];
  const eyes: DetectedEyeInfo[] = [];

  for (let fi = 0; fi < faces.length; fi++) {
    if (opts.signal?.aborted) break;
    opts.onProgress?.(0.85 + (0.15 * fi) / Math.max(1, faces.length));
    const f = faces[fi];
    const ed = Math.hypot(f.eyes[0].x - f.eyes[1].x, f.eyes[0].y - f.eyes[1].y);
    if (ed < 4) continue;
    let irises: [Iris, Iris] | null = null;
    try {
      irises = await irisesFor(source, f);
    } catch (e) {
      console.warn('landmarker failed', e);
    }
    const found: (EyeRegion | null)[] = [];
    if (irises) {
      const res = irises.map((iris) => (iris.openness >= 0.25 ? pupilFromIris(img, iris.x, iris.y, iris.r) : null));
      // Red-eye almost always hits both eyes. A pupil that is only "warm" (dull
      // brownish, same hue as a brown iris) counts only if the other eye is
      // clearly red, or if it is very warm on its own.
      const anyRed = res.some((r) => r?.isRed);
      irises.forEach((iris, k) => {
        let r = res[k];
        if (r && !r.isRed && !anyRed && r.warm < 35) r = null;
        found.push(r?.region ?? null);
        eyes.push({
          face: fi, x: iris.x, y: iris.y, irisR: iris.r, openness: iris.openness,
          red: r?.red ?? 0, surround: r?.surround ?? 0, region: r?.region ?? null,
        });
      });
    } else {
      // No landmarks: the "face" is usually a false detection (e.g. a mouth seen
      // sideways), so skip it. The user can still tap an eye manually.
      continue;
    }
    if (f.score < trusted) {
      // Weak face: only accept if both eyes are clearly red.
      if (!found.every((e) => e && (e.confidence ?? 0) >= 0.5)) continue;
    }
    for (const e of found) if (e && !overlaps(regions, e)) regions.push(e);
  }
  return { regions, faces, eyes };
}

function overlaps(list: EyeRegion[], r: EyeRegion): boolean {
  return list.some((o) => Math.hypot(o.cx - r.cx, o.cy - r.cy) < Math.max(o.rx, r.rx));
}
