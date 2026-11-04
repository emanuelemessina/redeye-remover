// Debug: print RGB / hue stats along a horizontal line through a point.
// Usage: npx tsx tools/probe.ts s14 1005 823 30
import { loadJpeg } from './imgutil';

const [id, xs, ys, rs] = process.argv.slice(2);
const img = loadJpeg(`fixtures/private/${id}.jpg`);
const cx = Number(xs);
const cy = Number(ys);
const R = Number(rs ?? 30);
for (const dy of [-Math.round(R / 3), 0, Math.round(R / 3)]) {
  const row: string[] = [];
  for (let dx = -R; dx <= R; dx += Math.max(1, Math.round(R / 12))) {
    // 3x3 average
    let r = 0, g = 0, b = 0;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const p = ((cy + dy + j) * img.width + cx + dx + i) * 4;
        r += img.data[p]; g += img.data[p + 1]; b += img.data[p + 2];
      }
    r /= 9; g /= 9; b /= 9;
    const hue = (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
    row.push(`${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)}|h${hue.toFixed(0)}`);
  }
  console.log(`dy=${dy}: ` + row.join('  '));
}
