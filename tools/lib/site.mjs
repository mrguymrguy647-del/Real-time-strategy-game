// Build the site into a temporary folder and serve it under a subpath, exactly like GitHub Pages
// hosts a preview. Used by the e2e tests and the screenshot tool.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../build.mjs';
import { startServer } from './server.mjs';

/** Same shape as the real preview URLs, so any absolute-URL bug shows up as a 404. */
export const SITE_BASE = '/Real-time-strategy-game/preview/e2e/';

/**
 * @param {{ base?: string, source?: string }} [options]
 */
export async function startSite({ base = SITE_BASE, source } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-site-'));
  build({ outDir: dir, source });
  const server = await startServer({ root: dir, base });
  return {
    dir,
    base,
    url: server.url,
    /** Build again into the same folder (a "new release"), optionally from a different source tree. @param {string} [otherSource] */
    rebuild(otherSource) {
      return build({ outDir: dir, source: otherSource });
    },
    async close() {
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
