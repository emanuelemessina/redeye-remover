/** Minimal RGBA image, compatible with ImageData. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** User-facing correction controls, all in 0..1. */
export interface CorrectionParams {
  /** Overall amount of the correction (0 = off, 1 = full). */
  strength: number;
  /** 0 = only remove the colour, 1 = black pupil. */
  darkness: number;
  /** Softness of the region edge. */
  feather: number;
}

export const DEFAULT_PARAMS: CorrectionParams = {
  strength: 1,
  darkness: 0.6,
  feather: 0.4,
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

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `eye-${Date.now().toString(36)}-${idCounter}`;
}
