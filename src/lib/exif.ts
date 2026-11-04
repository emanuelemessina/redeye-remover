// Minimal JPEG EXIF handling: copy the original APP1 (camera, date, GPS...) into
// the re-encoded file, with orientation reset (pixels are already upright) and
// the embedded thumbnail unlinked (it would still show red eyes).

export function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
}

/** Returns the full APP1 Exif segment (including the FFE1 marker), or null. */
export function extractExif(b: Uint8Array): Uint8Array | null {
  if (!isJpeg(b)) return null;
  let i = 2;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const size = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      return b.slice(i, i + 2 + size);
    }
    i += 2 + size;
  }
  return null;
}

/** Sets Orientation=1 and drops the IFD1 (thumbnail) link. Works on a copy. */
export function sanitizeExif(app1: Uint8Array): Uint8Array {
  const out = app1.slice();
  const tiff = 10; // FFE1 + len(2) + "Exif\0\0"
  if (out.length < tiff + 8) return out;
  const le = out[tiff] === 0x49; // "II" little endian, "MM" big endian
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);
  try {
    const ifd0 = tiff + u32(tiff + 4);
    const n = u16(ifd0);
    for (let k = 0; k < n; k++) {
      const e = ifd0 + 2 + k * 12;
      if (u16(e) === 0x0112) dv.setUint16(e + 8, 1, le);
    }
    dv.setUint32(ifd0 + 2 + n * 12, 0, le); // next IFD = none (drops thumbnail)
  } catch {
    /* malformed EXIF: keep as is */
  }
  return out;
}

/** Inserts an APP1 segment after SOI / APP0 of a freshly encoded JPEG. */
export function insertExif(jpeg: Uint8Array, app1: Uint8Array): Uint8Array {
  if (!isJpeg(jpeg)) return jpeg;
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]);
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, at), 0);
  out.set(app1, at);
  out.set(jpeg.subarray(at), at + app1.length);
  return out;
}
