// Automatic red-eye detection:
//   1. faces via MediaPipe BlazeFace over tiles + rotations (finds small / sideways faces)
//   2. precise irises via MediaPipe Face Landmarker on an upright crop of each face
//   3. per-iris pupil analysis decides "red or not" and sizes the correction region
import { scanFaces, type DetectedFace, type ScanOptions } from './faces';
import { irisesFor, type Iris } from './landmarks';
import { pupilFromIris } from './pupil';
import { refineAt } from './refine';
import { DEFAULT_PARAMS, newId, type EyeRegion, type RGBAImage } from './types';

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

/** Fallback when no iris landmarks: search for a red blob near a rough eye point. */
export function eyeRegionNearPoint(img: RGBAImage, x: number, y: number, eyeDist: number): EyeRegion | null {
  const fit = refineAt(img, x, y, eyeDist * 0.2, { maxRadius: eyeDist * 0.1, minRedness: 0.12 });
  if (!fit) return null;
  const contrast = fit.redness - fit.ringRedness;
  if (contrast < 0.08) return null;
  if (Math.hypot(fit.cx - x, fit.cy - y) > eyeDist * 0.16) return null;
  const rad = Math.min(eyeDist * 0.09, Math.max(eyeDist * 0.045, Math.sqrt(fit.rx * fit.ry)));
  return {
    id: newId(),
    cx: fit.cx,
    cy: fit.cy,
    rx: rad,
    ry: rad,
    angle: 0,
    params: { ...DEFAULT_PARAMS },
    source: 'auto',
    confidence: Math.min(1, contrast / 0.25) * 0.8,
  };
}

export async function detectRedEyes(
  img: RGBAImage,
  source: CanvasImageSource,
  opts: DetectOptions = {},
): Promise<DetectResult> {
  const faces = await scanFaces(source, img.width, img.height, { minScore: 0.6, ...opts });
  const trusted = opts.trustedFaceScore ?? 0.78;
  const regions: EyeRegion[] = [];
  const eyes: DetectedEyeInfo[] = [];

  for (let fi = 0; fi < faces.length; fi++) {
    if (opts.signal?.aborted) break;
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
      for (const iris of irises) {
        const res = iris.openness >= 0.2 ? pupilFromIris(img, iris.x, iris.y, iris.r) : null;
        found.push(res?.region ?? null);
        eyes.push({
          face: fi, x: iris.x, y: iris.y, irisR: iris.r, openness: iris.openness,
          red: res?.red ?? 0, surround: res?.surround ?? 0, region: res?.region ?? null,
        });
      }
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
