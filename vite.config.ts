import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

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
  plugins: [svelte(), debugSave()],
  server: { port: 5173, strictPort: true },
});
