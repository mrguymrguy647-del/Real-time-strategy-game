// Shared test helpers: read the real /data from disk and load it through the real loader.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../../src/core/data.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} relativePath e.g. "data/balance.json" */
export async function readJsonFromDisk(relativePath) {
  return JSON.parse(await fs.readFile(path.join(ROOT, relativePath), 'utf8'));
}

/** @type {Promise<import('../../src/core/data.js').GameData> | undefined} */
let cached;

/** The real game data, loaded once (it is frozen, so sharing it between tests is safe). */
export function loadTestData() {
  cached ??= loadData(readJsonFromDisk);
  return cached;
}
