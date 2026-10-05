// A small static file server for dist/. With `base` set (for example "/repo/preview/branch/") it
// answers only under that prefix, exactly like GitHub Pages does, so any absolute URL that would
// break on the real site breaks here too.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * @param {{ root: string, port?: number, base?: string }} options
 * @returns {Promise<{ server: http.Server, port: number, url: string, close: () => Promise<void> }>}
 */
export function startServer({ root, port = 0, base = '/' }) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const absoluteRoot = path.resolve(root);

  const server = http.createServer((req, res) => {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://localhost');
      const decoded = decodeURIComponent(pathname);
      if (!decoded.startsWith(prefix)) {
        if (`${decoded}/` === prefix) {
          res.writeHead(301, { Location: prefix });
          res.end();
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Not found: ${decoded} is outside the base path ${prefix}`);
        return;
      }
      let file = path.join(absoluteRoot, decoded.slice(prefix.length));
      if (!file.startsWith(absoluteRoot)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Not found: ${decoded}`);
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = /** @type {import('node:net').AddressInfo} */ (server.address());
      resolve({
        server,
        port: address.port,
        url: `http://127.0.0.1:${address.port}${prefix}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}
