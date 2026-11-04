// Producing the corrected file and handing it to the user.
import { correctedPatch } from '../core/correct';
import type { EyeRegion } from '../core/types';
import { insertExif, isJpeg, sanitizeExif } from './exif';
import { SAFE_CANVAS_AREA, type Photo } from './photo';

export function outputType(photo: Photo): 'image/png' | 'image/jpeg' {
  return photo.type === 'image/png' ? 'image/png' : 'image/jpeg';
}

export function copyName(photo: Photo): string {
  const base = photo.name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}-fixed.${outputType(photo) === 'image/png' ? 'png' : 'jpg'}`;
}

/** Renders the full-resolution corrected photo to an encoded file. */
export async function renderFile(photo: Photo, regions: EyeRegion[]): Promise<Blob> {
  const type = outputType(photo);
  let { width, height } = photo;
  // Browsers with a canvas size cap (iOS) get a slightly smaller output rather than a failure.
  let scale = 1;
  if (width * height > SAFE_CANVAS_AREA && !(await canvasCanHold(width, height))) {
    scale = Math.sqrt(SAFE_CANVAS_AREA / (width * height)) * 0.999;
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(photo.bitmap, 0, 0, width, height);
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d')!;
  for (const r of regions) {
    const { box, patch } = correctedPatch(photo.rgba, r, regions);
    if (!box.w || !box.h) continue;
    const id = new ImageData(new Uint8ClampedArray(patch.data), box.w, box.h);
    if (scale === 1) {
      ctx.putImageData(id, box.x0, box.y0);
    } else {
      tmp.width = box.w;
      tmp.height = box.h;
      tctx.putImageData(id, 0, 0);
      ctx.drawImage(tmp, box.x0 * scale, box.y0 * scale, box.w * scale, box.h * scale);
    }
  }
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, 0.95));
  canvas.width = canvas.height = 0; // free memory early (iOS)
  if (!blob) throw new Error('encode failed');
  if (type === 'image/jpeg' && photo.exif) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (isJpeg(bytes)) return new Blob([insertExif(bytes, sanitizeExif(photo.exif)) as BlobPart], { type });
  }
  return blob;
}

async function canvasCanHold(w: number, h: number): Promise<boolean> {
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = '#fff';
    ctx.fillRect(w - 1, h - 1, 1, 1);
    const ok = ctx.getImageData(w - 1, h - 1, 1, 1).data[3] === 255;
    c.width = c.height = 0;
    return ok;
  } catch {
    return false;
  }
}

const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const canSaveInPlace = (photo: Photo) =>
  !!photo.handle && (photo.type === "image/jpeg" || photo.type === "image/png");

/** Save as a new file: native save dialog (desktop Chromium), share sheet (phones), or download. */
export async function saveCopy(photo: Photo, blob: Blob): Promise<'saved' | 'cancelled'> {
  const name = copyName(photo);
  const file = new File([blob], name, { type: blob.type });

  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try {
      // iOS / Android: the share sheet offers "Save Image" to the photo library.
      await navigator.share({ files: [file] });
      return 'saved';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }

  if ('showSaveFilePicker' in window) {
    try {
      const startIn = photo.handle ?? 'pictures';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: name,
        startIn,
        types: [{ description: 'Image', accept: { [blob.type]: [blob.type === 'image/png' ? '.png' : '.jpg'] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return 'saved';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}

/** Overwrite the original file (only when opened with a file handle). */
export async function saveInPlace(photo: Photo, blob: Blob): Promise<'saved' | 'cancelled'> {
  const h = photo.handle as any;
  if (!h) throw new Error('no handle');
  if (h.requestPermission && (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return 'cancelled';
  const w = await h.createWritable();
  await w.write(blob);
  await w.close();
  return 'saved';
}
