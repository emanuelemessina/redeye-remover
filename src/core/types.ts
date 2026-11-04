/** Minimal RGBA image, compatible with ImageData. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** User-facing correction controls, all in 0..1. */
export interface CorrectionParams {
  /** How strongly the red is removed (0 = off, 1 = full). */
  strength: number;
  /** How dark the corrected pupil becomes. */
  darkness: number;
  /** Softness of the region edge. */
  feather: number;
  /** Higher = also catches duller / less saturated red. */
  sensitivity: number;
}

export const DEFAULT_PARAMS: CorrectionParams = {
  strength: 1,
  darkness: 0.55,
  feather: 0.35,
  sensitivity: 0.55,
};

/** An eye region: a (possibly rotated) ellipse in image pixel coordinates. */
export interface EyeRegion {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Rotation in radians. */
  angle: number;
  params: CorrectionParams;
  source: 'auto' | 'manual';
  /** 0..1, only meaningful for auto detections. */
  confidence?: number;
}

/** Correction threshold implied by `sensitivity` (shared by correction + auto-tuning). */
export function sensitivityToThreshold(sensitivity: number): number {
  return 0.42 - 0.34 * sensitivity;
}
export function thresholdToSensitivity(t0: number): number {
  return Math.min(1, Math.max(0, (0.42 - t0) / 0.34));
}

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `eye-${Date.now().toString(36)}-${idCounter}`;
}
