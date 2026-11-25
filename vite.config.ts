/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Builds go to folders the box never wipes:
//   npm run build        -> ./web   (served locally by server.mjs next to ./data)
//   npm run build:pages  -> ./site  (GitHub Pages; bundles the sanitized snapshot)
// base './' keeps every URL relative, so the same build works at
// http://127.0.0.1:5178/ and https://jay4thek1ng.github.io/jordan-ai-village/.

/** Emits sw.js with the exact list of files to precache for offline use. */
function serviceWorker(): Plugin {
  return {
    name: 'village-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const pub = (dir: string): string[] => readdirSync(`public/${dir}`).map((f) => `${dir}/${f}`);
      let sprites: string[] = [];
      try {
        sprites = readdirSync('snapshot/sprites').filter((f) => f.endsWith('.png')).sort().map((f) => `data/sprites/${f}`);
      } catch {
        /* snapshot sprites are optional until the public build copies them */
      }
      const files = ['./', ...Object.keys(bundle), 'manifest.webmanifest', ...pub('icons'), ...pub('rooms'), ...sprites].filter((f) => !f.endsWith('.map'));
      const version = Date.now().toString(36);
      const src = readFileSync('sw/sw.js', 'utf8').replace('__PRECACHE__', JSON.stringify(files)).replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  publicDir: 'public',
  plugins: [serviceWorker()],
  build: { outDir: mode === 'pages' ? 'site' : 'web', emptyOutDir: true, assetsInlineLimit: 0 },
  server: { port: 5179 },
}));
