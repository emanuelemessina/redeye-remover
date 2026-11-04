// Compare original vs. our edit vs. a reference (e.g. Lightroom) edit.
// Finds areas the reference changed, prints pixel stats and writes a crop sheet.
// Usage: npx tsx tools/compare.ts <orig.jpg> <ours.jpg> <ref.jpg> <out.jpg>
import { blank, crop, label, loadJpeg, paste, resize, saveJpeg } from './imgutil';
import type { RGBAImage } from '../src/core/types';

const [origP, oursP, refP, outP] = process.argv.slice(2);
const orig = loadJpeg(origP);
const ours = loadJpeg(oursP);
const ref = loadJpeg(refP);
const { width: W, height: H } = orig;

// Changed-pixel map (reference vs original), on 4x4 blocks to skip JPEG noise.
const B = 4;
const bw = Math.floor(W / B);
const bh = Math.floor(H / B);
const changed = new Uint8Array(bw * bh);
for (let by = 0; by < bh; by++)
  for (let bx = 0; bx < bw; bx++) {
    let d = 0;
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const i = ((by * B + y) * W + bx * B + x) * 4;
        d += Math.abs(orig.data[i] - ref.data[i]);
      }
    if (d / (B * B) > 25) changed[by * bw + bx] = 1;
  }
// Connected components of changed blocks.
const seen = new Uint8Array(bw * bh);
const blobs: { x: number; y: number; n: number }[] = [];
for (let k = 0; k < bw * bh; k++) {
  if (!changed[k] || seen[k]) continue;
  const st = [k];
  seen[k] = 1;
  let n = 0, sx = 0, sy = 0;
  while (st.length) {
    const q = st.pop()!;
    const x = q % bw, y = (q - x) / bw;
    n++; sx += x; sy += y;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const nk = ny * bw + nx;
      if (changed[nk] && !seen[nk]) { seen[nk] = 1; st.push(nk); }
    }
  }
  if (n >= 2) blobs.push({ x: (sx / n + 0.5) * B, y: (sy / n + 0.5) * B, n });
}
blobs.sort((a, b) => b.n - a.n);
console.log('changed areas:', blobs.slice(0, 10).map((b) => `(${b.x | 0},${b.y | 0}) n=${b.n}`).join(' '));

function stats(img: RGBAImage, cx: number, cy: number, r: number) {
  let n = 0, R = 0, G = 0, Bl = 0;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const i = ((Math.round(cy) + y) * W + Math.round(cx) + x) * 4;
      R += img.data[i]; G += img.data[i + 1]; Bl += img.data[i + 2]; n++;
    }
  return `${(R / n).toFixed(0)},${(G / n).toFixed(0)},${(Bl / n).toFixed(0)}`;
}

const top = blobs.slice(0, 6);
const cell = 220;
const sheet = blank(cell * 3, cell * top.length, 30);
top.forEach((b, row) => {
  const half = 22;
  console.log(`area ${row} (${b.x | 0},${b.y | 0}) mean r=5: orig ${stats(orig, b.x, b.y, 5)} | ours ${stats(ours, b.x, b.y, 5)} | ref ${stats(ref, b.x, b.y, 5)}`);
  [orig, ours, ref].forEach((img, col) => {
    const c = resize(crop(img, Math.round(b.x - half), Math.round(b.y - half), half * 2, half * 2), cell - 4, cell - 4);
    paste(sheet, c, col * cell + 2, row * cell + 2);
  });
  label(sheet, String(row), 6, row * cell + 6, 3);
});
saveJpeg(outP, sheet, 92);
