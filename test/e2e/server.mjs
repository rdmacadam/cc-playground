// Tiny static server for local viewing and E2E tests (mic works on localhost).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
};

// Maps a URL path to a file inside root, or null for anything outside it or hidden (.git, .env…).
export function resolveSafe(root, urlPath) {
  const file = normalize(join(root, urlPath.endsWith('/') ? `${urlPath}index.html` : urlPath));
  if (!file.startsWith(root + sep)) return null;
  if (file.slice(root.length + 1).split(sep).some(part => part.startsWith('.'))) return null;
  return file;
}

export function startServer(port = Number(process.env.PORT) || 5173) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = resolveSafe(ROOT, path);
    if (!file) { res.writeHead(404).end('not found'); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  // Loopback only: this is a dev server, not something to expose on the local network.
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startServer();
  console.log(`Chladni running at http://127.0.0.1:${server.address().port}`);
}
