// Debug: render one eye region with every eye colour, side by side.
// Usage: npx tsx tools/variants.ts out.jpg s13:1429,785,11.4,0.75 s04:712,1012,6,0.6 ...
import { correctAll } from '../src/core/correct';
import { DEFAULT_PARAMS, type EyeColor, type EyeRegion } from '../src/core/types';
import { blank, crop, label, loadJpeg, paste, resize, saveJpeg } from './imgutil';

const [out, ...specs] = process.argv.slice(2);
const colors: EyeColor[] = ['natural', 'brown', 'hazel', 'green', 'blue', 'gray'];
const cell = 150;
const sheet = blank(cell * (colors.length + 1), cell * specs.length, 30);
specs.forEach((spec, row) => {
  const [id, nums] = spec.split(':');
  const [cx, cy, r, pupil] = nums.split(',').map(Number);
  const img = loadJpeg(`fixtures/private/${id}.jpg`);
  const half = Math.round(r * 2.6);
  const show = (im: typeof img, col: number) =>
    paste(sheet, resize(crop(im, Math.round(cx - half), Math.round(cy - half), half * 2, half * 2), cell - 4, cell - 4), col * cell + 2, row * cell + 2);
  show(img, 0);
  colors.forEach((c, k) => {
    const reg: EyeRegion = { id: 'x', cx, cy, rx: r, ry: r, angle: 0, source: 'manual', params: { ...DEFAULT_PARAMS, pupil: c === 'natural' ? pupil : Math.min(pupil, 0.45), eyeColor: c } };
    show(correctAll(img, [reg]), k + 1);
  });
  label(sheet, String(row), 4, row * cell + 4, 3);
});
saveJpeg(out, sheet, 92);
console.log('cols: original,', colors.join(', '));
