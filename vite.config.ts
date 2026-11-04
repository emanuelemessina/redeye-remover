import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

/** Dev-only: lets the debug page save PNG sheets into eval-out/ for review. */
function debugSave(): Plugin {
  return {
    name: 'debug-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        const name = basename(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'out.png');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync('eval-out', { recursive: true });
          writeFileSync(join('eval-out', name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths and inside native wrappers.
  base: './',
  plugins: [
    svelte(),
    debugSave(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Red-eye Remover',
        short_name: 'Red-eye',
        description: 'Fix red eyes in your photos. Free, private, works offline.',
        theme_color: '#17171a',
        background_color: '#17171a',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything, including the ML runtime + models, so it works fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,task,tflite}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
