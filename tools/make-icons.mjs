// Render the PNG app icons from assets/icons/icon.svg using the same Chromium the tests use, so
// no image library is needed. The PNGs are committed; run this only when the SVG changes:
//   npm run icons

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets/icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'));

// The artwork stays inside the central 80% of the square, so the same image works as a
// "maskable" Android icon and as the full-bleed iOS icon.
const ICONS = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];

const browser = await chromium.launch(launchOptions());
try {
  for (const [name, size] of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#0b1a2b"><img src="data:image/svg+xml;base64,${svg.toString('base64')}" width="${size}" height="${size}" style="display:block"></body>`,
    );
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: path.join(dir, name), clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`wrote assets/icons/${name} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
