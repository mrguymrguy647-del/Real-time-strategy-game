// Fetch (once) and read the Natural Earth files the map tools need. They are cached in the git-ignored
// .cache/ folder under the pinned commit, so a rebuild needs no network after the first run.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FILES = { admin1: 'ne_10m_admin_1_states_provinces.geojson', admin0: 'ne_10m_admin_0_countries.geojson' };

/**
 * @param {string} commit the pinned natural-earth-vector commit
 * @param {string} cacheDir
 * @param {Array<'admin0' | 'admin1'>} [which] only these are read (the admin-1 file is 40 MB)
 * @returns {Record<string, any>} { admin0?, admin1? } as parsed GeoJSON
 */
export function loadNaturalEarth(commit, cacheDir, which = ['admin1', 'admin0']) {
  const dir = path.join(cacheDir, commit);
  fs.mkdirSync(dir, { recursive: true });
  /** @type {Record<string, any>} */
  const loaded = {};
  for (const key of which) {
    const name = FILES[key];
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/${name}`;
      console.log(`Downloading ${name} (Natural Earth ${commit.slice(0, 7)}) ...`);
      execFileSync('curl', ['-fsSL', '--retry', '3', '-o', `${file}.part`, url], { stdio: 'inherit' });
      fs.renameSync(`${file}.part`, file);
    }
    loaded[key] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return loaded;
}
