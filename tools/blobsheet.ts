// Debug: run the blob scan on fixtures and write overview + candidate crop sheets.
// Usage: npx tsx tools/blobsheet.ts [outDir] [ids...]
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectRedBlobs } from '../src/core/blobs';
import { blank, circle, crop, label, loadJpeg, paste, resize, saveJpeg } from './imgutil';

const outDir = process.argv[2] ?? 'eval-out';
const only = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });
const dir = 'fixtures/private';
const files = readdirSync(dir).filter((f) => f.endsWith('.jpg') && (!only.length || only.some((o) => f.includes(o))));

for (const f of files) {
  const img = loadJpeg(join(dir, f));
  const t = performance.now();
  const cands = detectRedBlobs(img);
  const ms = performance.now() - t;
  console.log(`${f}: ${img.width}x${img.height} ${cands.length} candidates in ${ms.toFixed(0)}ms`);
  console.log(
    cands
      .slice(0, 12)
      .map((c, i) => `  #${i} (${c.cx.toFixed(0)},${c.cy.toFixed(0)}) r=${c.r.toFixed(1)} red=${c.meanRed.toFixed(2)} ring=${c.ringRed.toFixed(2)} rnd=${c.roundness.toFixed(2)} pair=${c.paired} score=${c.score.toFixed(3)}`)
      .join('\n'),
  );

  // Overview with top candidates circled.
  const sc = 1000 / Math.max(img.width, img.height);
  const ov = resize(img, Math.round(img.width * sc), Math.round(img.height * sc));
  cands.slice(0, 12).forEach((c, i) => {
    circle(ov, c.cx * sc, c.cy * sc, Math.max(6, c.r * sc * 3), i < 4 ? [0, 255, 0] : [0, 200, 255], 2);
    label(ov, String(i), c.cx * sc + 10, c.cy * sc - 10, 2);
  });
  saveJpeg(join(outDir, f.replace('.jpg', '-ov.jpg')), ov);

  // Crop sheet of top 16.
  const cell = 140;
  const sheet = blank(cell * 4, cell * 4, 40);
  cands.slice(0, 16).forEach((c, i) => {
    const half = Math.max(12, Math.round(c.r * 5));
    const cr = resize(crop(img, Math.round(c.cx - half), Math.round(c.cy - half), half * 2, half * 2), cell - 4, cell - 4);
    paste(sheet, cr, (i % 4) * cell + 2, Math.floor(i / 4) * cell + 2);
    label(sheet, String(i), (i % 4) * cell + 4, Math.floor(i / 4) * cell + 4, 3);
  });
  saveJpeg(join(outDir, f.replace('.jpg', '-cands.jpg')), sheet);
}
