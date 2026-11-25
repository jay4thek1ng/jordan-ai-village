// Tiny static server: ./web (built app) at /, ./data (status.json + sprites) at /data/.
// Local only. Usage: node server.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(new URL('.', import.meta.url).pathname);
const port = Number(process.argv[2] || process.env.PORT || 5178);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
  const isData = path.startsWith('/data/');
  const base = join(root, isData ? 'data' : 'web');
  const rel = normalize(isData ? path.slice(6) : path === '/' ? 'index.html' : path.slice(1));
  const file = join(base, rel);
  // Only status.json and sprites are public from data/; never logs or hooks.
  const allowed = !rel.startsWith('..') && (!isData || rel === 'status.json' || /^sprites\/[a-z0-9-]+\.png$/.test(rel));
  try {
    if (!allowed || !(await stat(file)).isFile()) throw new Error('nope');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Jordan AI Village on http://127.0.0.1:${port}/`));
