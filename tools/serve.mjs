// Serve the built site: npm run serve   (then open the printed address)
//   node tools/serve.mjs --port 4173 --base /Real-time-strategy-game/preview/test/
// Build first (npm run build); `npm run serve` does both.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const { url } = await startServer({
  root: path.resolve(root, option('--dir', 'dist')),
  port: Number(option('--port', '4173')),
  base: option('--base', '/'),
});
console.log(`Serving at ${url}  (Ctrl+C to stop)`);
