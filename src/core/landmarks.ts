// Browser-only: precise iris landmarks for an already detected face.
// The face crop is rotated upright before running MediaPipe Face Landmarker.
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { DetectedFace } from './faces';

export interface Iris {
  x: number;
  y: number;
  /** Iris radius in full image pixels. */
  r: number;
  /** Eyelid opening / iris diameter (≈0 closed, ≈0.8+ open). */
  openness: number;
}

const IRIS = [
  [468, 469, 470, 471, 472],
  [473, 474, 475, 476, 477],
];
const LIDS = [
  [159, 145],
  [386, 374],
];

let landmarker: Promise<FaceLandmarker> | null = null;

export function loadLandmarker(base = import.meta.env.BASE_URL): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/face_landmarker.task`, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
      });
    })();
    landmarker.catch(() => (landmarker = null));
  }
  return landmarker;
}

const N = 384;
let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;

/** Returns the two irises of `face`, or null if the landmarker could not lock on. */
export async function irisesFor(source: CanvasImageSource, face: DetectedFace): Promise<[Iris, Iris] | null> {
  const lm = await loadLandmarker();
  if (!canvas) {
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(N, N);
    else {
      canvas = document.createElement('canvas');
      canvas.width = N;
      canvas.height = N;
    }
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const mid = { x: (face.eyes[0].x + face.eyes[1].x) / 2, y: (face.eyes[0].y + face.eyes[1].y) / 2 };
  const up = { x: mid.x - face.mouth.x, y: mid.y - face.mouth.y };
  const theta = Math.atan2(up.x, -up.y); // 0 when the face is upright
  // Crop centred between eyes and mouth, a bit larger than the face.
  const c = { x: (mid.x * 2 + face.mouth.x) / 3, y: (mid.y * 2 + face.mouth.y) / 3 };
  const S = Math.max(face.size * 1.9, Math.hypot(up.x, up.y) * 5);
  const k = N / S;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, N, N);
  ctx.translate(N / 2, N / 2);
  ctx.scale(k, k);
  ctx.rotate(-theta);
  ctx.translate(-c.x, -c.y);
  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const res = lm.detect(canvas as HTMLCanvasElement);
  const pts = res.faceLandmarks[0];
  if (!pts) return null;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const toImg = (i: number) => {
    const u = (pts[i].x * N - N / 2) / k;
    const v = (pts[i].y * N - N / 2) / k;
    return { x: c.x + u * cos - v * sin, y: c.y + u * sin + v * cos };
  };
  const out = IRIS.map((ids, e) => {
    const ctr = toImg(ids[0]);
    let r = 0;
    for (let i = 1; i < 5; i++) {
      const p = toImg(ids[i]);
      r += Math.hypot(p.x - ctr.x, p.y - ctr.y);
    }
    r /= 4;
    const a = toImg(LIDS[e][0]);
    const b = toImg(LIDS[e][1]);
    return { x: ctr.x, y: ctr.y, r, openness: Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1e-3, 2 * r) };
  }) as [Iris, Iris];

  // Sanity: landmarked eyes must be near the detector's eyes.
  const ed = Math.hypot(face.eyes[0].x - face.eyes[1].x, face.eyes[0].y - face.eyes[1].y);
  const near = (p: Iris) => Math.min(...face.eyes.map((e) => Math.hypot(e.x - p.x, e.y - p.y))) < ed * 0.35;
  if (!out.every(near)) return null;
  return out;
}
