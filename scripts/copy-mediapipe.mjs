// Copies the MediaPipe WASM runtime into public/ so the app works offline (no CDN).
// Only the default (non-module) variant is loaded by FilesetResolver.forVisionTasks.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
rmSync('public/mediapipe', { recursive: true, force: true });
mkdirSync('public/mediapipe', { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  copyFileSync(`node_modules/@mediapipe/tasks-vision/wasm/${f}`, `public/mediapipe/${f}`);
}
