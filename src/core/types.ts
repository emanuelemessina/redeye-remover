/** Minimal RGBA image, compatible with ImageData. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export type EyeColor = 'natural' | 'brown' | 'hazel' | 'green' | 'blue' | 'gray';

/** Iris tints (sRGB, mid-tone) used when the user picks an eye colour. */
export const EYE_COLORS: Record<Exclude<EyeColor, 'natural'>, [number, number, number]> = {
  brown: [98, 70, 50],
  hazel: [112, 96, 66],
  green: [92, 108, 80],
  blue: [96, 112, 132],
  gray: [110, 114, 118],
};

/**
 * Per-eye controls. The circle is the iris; the pupil is a centred disc inside it.
 * Everything is applied to the whole circle (no automatic pixel selection), so
 * each control always has a visible effect.
 */
export interface CorrectionParams {
  /** Overall amount of the correction (0 = off, 1 = full). */
  strength: number;
  /** Pupil radius as a fraction of the circle (1 = the whole circle is pupil). */
  pupil: number;
  /** Pupil darkness: 0 = just remove the colour, 1 = black. */
  darkness: number;
  /** How much of the small white reflection (catchlight) to keep. */
  shine: number;
  /** Iris colour around the pupil. 'natural' keeps the iris, only removing red. */
  eyeColor: EyeColor;
  /** Softness of the outer edge. */
  feather: number;
}

export const DEFAULT_PARAMS: CorrectionParams = {
  strength: 1,
  pupil: 0.6,
  darkness: 0.6,
  shine: 0.6,
  eyeColor: 'natural',
  feather: 0.3,
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
