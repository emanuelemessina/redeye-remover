// Dev-only page: runs automatic detection + correction on fixtures/private/*.jpg
// and shows before/after crops per eye, plus eyes of faces that were skipped.
// Results are exposed on window.__debug for automation.
import { correctAll } from '../core/correct';
import { detectRedEyes } from '../core/detect';
import type { FaceModel } from '../core/faces';
import type { EyeRegion, RGBAImage } from '../core/types';

const statusEl = document.getElementById('status')!;
const logEl = document.getElementById('log')!;
const out = document.getElementById('out')!;
const log = (s: string) => (logEl.textContent += s + '\n');

const params = new URLSearchParams(location.search);
const ids = (params.get('ids') ?? Array.from({ length: 16 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`).join(','))
  .split(',')
  .filter(Boolean);
const nums = (k: string, d: string) => (params.get(k) ?? d).split(',').filter(Boolean).map(Number);

const results: { photo: string; ms: number; regions: EyeRegion[]; faces: unknown[] }[] = [];
(window as any).__debug = { results, done: false };

async function loadImage(url: string) {
  const blob = await (await fetch(url)).blob();
  const sc = Number(params.get('scale') ?? 1);
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const bmp = sc === 1 ? full : await createImageBitmap(full, { resizeWidth: Math.round(full.width * sc), resizeHeight: Math.round(full.height * sc), resizeQuality: 'high' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const id = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { bmp, img: { width: id.width, height: id.height, data: id.data } as RGBAImage };
}

const CELL = Number(params.get('cell') ?? 110);
const COLS = 8;
const grid = document.createElement('canvas');
grid.width = CELL * COLS;
grid.height = CELL;
out.appendChild(grid);
const gctx = grid.getContext('2d')!;
let cellIdx = 0;
function addCell(src: CanvasImageSource, x: number, y: number, half: number, text: string, color: string) {
  const row = Math.floor(cellIdx / COLS);
  if ((row + 1) * CELL > grid.height) {
    const old = gctx.getImageData(0, 0, grid.width, grid.height);
    grid.height = (row + 1) * CELL;
    gctx.putImageData(old, 0, 0);
  }
  const cx = (cellIdx % COLS) * CELL;
  const cy = row * CELL;
  gctx.imageSmoothingEnabled = false;
  gctx.drawImage(src, x - half, y - half, half * 2, half * 2, cx + 1, cy + 1, CELL - 2, CELL - 2);
  gctx.fillStyle = '#000a';
  gctx.fillRect(cx + 1, cy + 1, CELL - 2, 13);
  gctx.fillStyle = color;
  gctx.font = '10px monospace';
  gctx.fillText(text, cx + 3, cy + 11);
  cellIdx++;
}

(async () => {
  const model = (params.get('model') ?? 'short') as FaceModel;
  for (const id of ids) {
    statusEl.textContent = `scanning ${id}…`;
    const { bmp, img } = await loadImage(`/fixtures/private/${id}.jpg`);
    const t = performance.now();
    const det = await detectRedEyes(img, bmp, {
      model,
      coarseFracs: nums('coarse', '0.55'),
      fineFracs: nums('fine', '0.3'),
    });
    const ms = performance.now() - t;
    const { regions, faces } = det;
    const fixed = correctAll(img, regions);
    const after = new OffscreenCanvas(img.width, img.height);
    after.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(fixed.data), img.width, img.height), 0, 0);
    for (const r of regions) {
      const half = Math.max(10, r.rx * 3.5);
      const ei = det.eyes.find((e) => e.region === r);
      addCell(bmp, r.cx, r.cy, half, `${id} c${(r.confidence ?? 0).toFixed(2)} ${ei ? ei.red.toFixed(2) + '/' + ei.surround.toFixed(2) : 'nolm'}`, '#ff0');
      addCell(after, r.cx, r.cy, half, `after r${r.rx.toFixed(0)}`, '#0f0');
    }
    // Eyes that were examined but not corrected (possible misses).
    const { eyes } = det;
    for (const e of eyes) {
      if (e.region || faces[e.face].score < 0.78) continue;
      addCell(bmp, e.x, e.y, Math.max(8, e.irisR * 3.5), `${id} no ${e.red.toFixed(2)} o${e.openness.toFixed(1)}`, '#f66');
    }
    results.push({ photo: id, ms, regions, faces, eyes: det.eyes } as any);
    log(`${id}: ${faces.length} faces, ${regions.length} eyes in ${ms.toFixed(0)}ms`);
  }
  if (params.get('save')) {
    const blob: Blob = await new Promise((r) => grid.toBlob((b) => r(b!), 'image/png'));
    await fetch(`/__save?name=${params.get('save')}`, { method: 'POST', body: blob });
  }
  statusEl.textContent = 'done';
  (window as any).__debug.done = true;
})().catch((e) => {
  statusEl.textContent = 'error: ' + e;
  console.error(e);
});
