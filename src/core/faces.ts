// Browser-only: face detection via MediaPipe BlazeFace, scanned over tiles and
// 4 rotations so that small and sideways faces are found too.
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface FacePoint {
  x: number;
  y: number;
}

export interface DetectedFace {
  /** Approximate eye centers in full image pixels (subject's right, left). */
  eyes: [FacePoint, FacePoint];
  nose: FacePoint;
  mouth: FacePoint;
  /** Face box width in full image pixels. */
  size: number;
  score: number;
  /** Which tile level / rotation produced it (debug). */
  via: string;
}

export type FaceModel = 'short' | 'full';

const detectors = new Map<FaceModel, Promise<FaceDetector>>();

export function loadDetector(model: FaceModel = 'short', base = import.meta.env.BASE_URL): Promise<FaceDetector> {
  let p = detectors.get(model);
  if (!p) {
    p = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: `${base}models/blaze_face_${model}_range.tflite`, delegate },
        runningMode: 'IMAGE' as const,
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      });
      // CPU is faster than GPU here: inputs are tiny and GPU readback dominates.
      return await FaceDetector.createFromOptions(fileset, opts('CPU'));
    })();
    p.catch(() => detectors.delete(model));
    detectors.set(model, p);
  }
  return p;
}

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;
function makeCanvas(w: number, h: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export interface ScanOptions {
  model?: FaceModel;
  /** Tile sizes as fractions of the shorter image side, scanned at all 4 rotations. */
  coarseFracs?: number[];
  /** Smaller tiles, scanned only at the rotations where coarse tiles found faces. */
  fineFracs?: number[];
  /** Longest side of each tile fed to the detector. */
  tileInput?: number;
  minScore?: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Level {
  tiles: Tile[];
  label: string;
  /** Coarse levels try all rotations; fine levels only the rotations that found faces. */
  allRotations: boolean;
}

function tileLevels(w: number, h: number, coarse: number[], fine: number[]): Level[] {
  const minDim = Math.min(w, h);
  const out: Level[] = [{ tiles: [{ x: 0, y: 0, w, h }], label: 'full', allRotations: true }];
  const add = (frac: number, allRotations: boolean) => {
    const size = Math.round(minDim * frac);
    if (size < 64) return;
    const step = Math.round(size / 2);
    const tiles: Tile[] = [];
    for (let y = 0; ; y += step) {
      const ty = Math.max(0, Math.min(y, h - size));
      for (let x = 0; ; x += step) {
        const tx = Math.max(0, Math.min(x, w - size));
        tiles.push({ x: tx, y: ty, w: Math.min(size, w), h: Math.min(size, h) });
        if (tx >= w - size) break;
      }
      if (ty >= h - size) break;
    }
    out.push({ tiles, label: `t${frac}`, allRotations });
  };
  coarse.forEach((f) => add(f, true));
  fine.forEach((f) => add(f, false));
  return out;
}

/** Scan a full image for faces. `source` must be drawable (ImageBitmap / canvas / img). */
export async function scanFaces(
  source: CanvasImageSource,
  width: number,
  height: number,
  opts: ScanOptions = {},
): Promise<DetectedFace[]> {
  const det = await loadDetector(opts.model ?? 'short');
  const tileInput = opts.tileInput ?? 512;
  const minScore = opts.minScore ?? 0.6;
  const levels = tileLevels(width, height, opts.coarseFracs ?? [0.55], opts.fineFracs ?? [0.3]);
  const votes = [0, 0, 0, 0];
  // Progress: each level gets a fixed share of the bar (by its tile count), so the
  // bar never jumps back when the fine level learns how many rotations it needs.
  const weights = levels.map((l) => l.tiles.length * (l.allRotations ? 4 : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let doneWeight = 0;
  let faces: DetectedFace[] = [];
  const canvas = makeCanvas(tileInput, tileInput);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    let rotations = [0, 1, 2, 3];
    if (!level.allRotations) {
      const best = Math.max(...votes);
      rotations = best > 0 ? rotations.filter((k) => votes[k] >= best * 0.4) : rotations;
    }
    const levelSteps = level.tiles.length * rotations.length;
    let levelDone = 0;
    for (const tile of level.tiles) {
      const scale = Math.min(1, tileInput / Math.max(tile.w, tile.h));
      const sw = Math.max(1, Math.round(tile.w * scale));
      const sh = Math.max(1, Math.round(tile.h * scale));
      for (const k of rotations) {
        levelDone++;
        const cw = k % 2 ? sh : sw;
        const ch = k % 2 ? sw : sh;
        canvas.width = cw;
        canvas.height = ch;
        if (k === 0) ctx.setTransform(1, 0, 0, 1, 0, 0);
        else if (k === 1) ctx.setTransform(0, 1, -1, 0, sh, 0);
        else if (k === 2) ctx.setTransform(-1, 0, 0, -1, sw, sh);
        else ctx.setTransform(0, -1, 1, 0, 0, sw);
        ctx.drawImage(source, tile.x, tile.y, tile.w, tile.h, 0, 0, sw, sh);
        const res = det.detect(canvas as unknown as HTMLCanvasElement);
        for (const d of res.detections) {
          const score = d.categories[0]?.score ?? 0;
          if (score < minScore || d.keypoints.length < 4) continue;
          // Keypoints in rotated-canvas pixels.
          const kp = d.keypoints.map((p) => ({ u: p.x * cw, v: p.y * ch }));
          // Only accept detections that are roughly upright in this rotation; the
          // same face is then picked up by the rotation that suits it best.
          const eyeMidU = (kp[0].u + kp[1].u) / 2;
          const eyeMidV = (kp[0].v + kp[1].v) / 2;
          const roll = Math.atan2(eyeMidU - kp[3].u, kp[3].v - eyeMidV); // 0 when mouth is straight below eyes
          if (Math.abs(roll) > (50 * Math.PI) / 180) continue;
          const toImg = (p: { u: number; v: number }): FacePoint => {
            let x: number;
            let y: number;
            if (k === 0) [x, y] = [p.u, p.v];
            else if (k === 1) [x, y] = [p.v, sh - p.u];
            else if (k === 2) [x, y] = [sw - p.u, sh - p.v];
            else [x, y] = [sw - p.v, p.u];
            return { x: tile.x + x / scale, y: tile.y + y / scale };
          };
          const eyes: [FacePoint, FacePoint] = [toImg(kp[0]), toImg(kp[1])];
          const size = (d.boundingBox?.width ?? 0) / scale;
          // Skip faces cut by a tile border (an overlapping tile sees them whole).
          if (level.label !== 'full') {
            const m = 0.15 * size;
            const ok = eyes.every((e) => e.x > tile.x + m && e.x < tile.x + tile.w - m && e.y > tile.y + m && e.y < tile.y + tile.h - m);
            if (!ok) continue;
          }
          votes[k] += score;
          faces = addFace(faces, {
            eyes,
            nose: toImg(kp[2]),
            mouth: toImg(kp[3]),
            size,
            score,
            via: `${level.label}/r${k * 90}`,
          });
        }
        opts.onProgress?.((doneWeight + (weights[li] * levelDone) / levelSteps) / weightSum);
      }
      // Yield so the UI stays responsive.
      await new Promise((r) => setTimeout(r, 0));
      if (opts.signal?.aborted) return faces;
    }
    doneWeight += weights[li];
  }
  return faces;
}

/** Merge a face into the list, keeping the higher-scoring of duplicates. */
function addFace(faces: DetectedFace[], f: DetectedFace): DetectedFace[] {
  const mid = (g: DetectedFace) => ({ x: (g.eyes[0].x + g.eyes[1].x) / 2, y: (g.eyes[0].y + g.eyes[1].y) / 2 });
  const fm = mid(f);
  for (let i = 0; i < faces.length; i++) {
    const g = faces[i];
    const gm = mid(g);
    if (Math.hypot(fm.x - gm.x, fm.y - gm.y) < 0.35 * Math.max(f.size, g.size)) {
      if (f.score > g.score) faces[i] = f;
      return faces;
    }
  }
  faces.push(f);
  return faces;
}
