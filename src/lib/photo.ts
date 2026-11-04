// Loading a photo from the user's device into memory.
import type { RGBAImage } from '../core/types';
import { extractExif } from './exif';

export interface Photo {
  name: string;
  /** MIME type of the original file. */
  type: string;
  width: number;
  height: number;
  /** Upright (EXIF-rotated) bitmap, used for drawing and face scanning. */
  bitmap: ImageBitmap;
  /** Full-resolution pixels of the upright image. */
  rgba: RGBAImage;
  /** Original EXIF segment (JPEG only). */
  exif: Uint8Array | null;
  /** Set when opened via the File System Access API: allows saving in place. */
  handle?: FileSystemFileHandle;
}

export class PhotoLoadError extends Error {
  constructor(public reason: 'unsupported' | 'too-large' | 'unknown') {
    super(reason);
  }
}

/** Largest canvas area that works everywhere (iOS Safari limit). */
const SAFE_CANVAS_AREA = 16_777_216;
const TILE = 2048;

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari: decode through an <img>, which applies EXIF orientation.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Reads all pixels of a bitmap, tile by tile so huge photos never need a huge canvas. */
export function readPixels(bitmap: ImageBitmap): RGBAImage {
  const { width, height } = bitmap;
  const data = new Uint8ClampedArray(width * height * 4);
  const tw = Math.min(TILE, width);
  const th = Math.min(TILE, height);
  const c = makeCanvas(tw, th);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  for (let y = 0; y < height; y += th) {
    for (let x = 0; x < width; x += tw) {
      const w = Math.min(tw, width - x);
      const h = Math.min(th, height - y);
      ctx.clearRect(0, 0, tw, th);
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
      const part = ctx.getImageData(0, 0, w, h).data;
      for (let j = 0; j < h; j++) {
        data.set(part.subarray(j * w * 4, (j + 1) * w * 4), ((y + j) * width + x) * 4);
      }
    }
  }
  return { width, height, data };
}

export async function loadPhoto(file: File, handle?: FileSystemFileHandle): Promise<Photo> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new PhotoLoadError('unsupported');
  }
  if (bitmap.width * bitmap.height > 120_000_000) throw new PhotoLoadError('too-large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    name: file.name || 'photo.jpg',
    type: file.type || 'image/jpeg',
    width: bitmap.width,
    height: bitmap.height,
    bitmap,
    rgba: readPixels(bitmap),
    exif: extractExif(bytes),
    handle,
  };
}

export const supportsFileSystemAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

/** Chromium desktop: open with a file handle so we can later save in place. */
export async function pickWithHandle(): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'Photos', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif'] } }],
      excludeAcceptAllOption: false,
      multiple: false,
    });
    return { file: await handle.getFile(), handle };
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
}

/** Display resolution: never larger than what every browser can draw in one canvas. */
export function displayScale(w: number, h: number): number {
  return Math.min(1, 4096 / Math.max(w, h), Math.sqrt(SAFE_CANVAS_AREA / (w * h)));
}

export { SAFE_CANVAS_AREA };
