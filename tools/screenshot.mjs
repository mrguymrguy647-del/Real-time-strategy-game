// Phone-sized screenshots of every screen, so UI changes can be looked at without a phone.
//   npm run screenshot                                 all screens (including the map), portrait and landscape
//   node tools/screenshot.mjs --views portrait --only title,play --out tmp/shots
// Output goes to tmp/screenshots/ by default (git-ignored).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PHONES, launchOptions } from './lib/browser.mjs';
import { goTo, newGame, openApp, t, waitForDiagnostics } from './lib/drive.mjs';
import { startSite } from './lib/site.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const views = option('--views', 'portrait,landscape').split(',');
const only = option('--only', 'title,play,saves,settings,diagnostics,map').split(',');
const outDir = path.resolve(root, option('--out', 'tmp/screenshots'));
fs.mkdirSync(outDir, { recursive: true });

const site = await startSite();
const browser = await chromium.launch(launchOptions());
try {
  for (const view of views) {
    const context = await browser.newContext(/** @type {any} */ (PHONES)[view]);
    const page = await context.newPage();
    const shot = async (name) => {
      const file = path.join(outDir, `${view}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`wrote ${path.relative(root, file)}`);
    };

    await openApp(page, site.url);
    if (only.includes('title')) await shot('title');

    await newGame(page, 3);
    await page.getByRole('button', { name: t('play.save') }).click();
    await page.waitForTimeout(300);
    if (only.includes('play')) await shot('play');

    if (only.includes('saves')) {
      await goTo(page, 'saves');
      await page.waitForSelector('[data-slot]');
      await shot('saves');
    }
    if (only.includes('settings')) {
      await goTo(page, 'settings');
      await shot('settings');
    }
    if (only.includes('diagnostics')) {
      await goTo(page, 'diagnostics');
      await waitForDiagnostics(page);
      await shot('diagnostics');
    }
    if (only.includes('map')) {
      // The whole map, then a tap on Iran (a region near the middle of its country) with the info panel open.
      await goTo(page, 'title');
      await page.waitForSelector('.toast', { state: 'detached', timeout: 10_000 }).catch(() => {}); // the "Saved" toast from the Play screen
      await page.getByRole('button', { name: t('title.map'), exact: true }).click();
      await page.waitForFunction(() => globalThis.__map?.info().frames, null, { timeout: 30_000 });
      await page.waitForTimeout(1500); // the sharp texture is baked a moment after the first frame
      await shot('map');
      const [x, y] = await page.evaluate(() => {
        const map = globalThis.__map;
        const label = map.geometry.regions.find((r) => r.id === 'IRN-fars_bushehr').label;
        const view = map.getView();
        const rect = map.root.getBoundingClientRect();
        return [rect.left + rect.width / 2 + (label[0] - view.cx) * view.zoom, rect.top + rect.height / 2 + (label[1] - view.cy) * view.zoom];
      });
      await page.touchscreen.tap(x, y);
      await page.waitForSelector('.sheet:not([hidden])');
      await page.waitForTimeout(900); // the camera glide
      await shot('map-panel');
    }
    await context.close();
  }
} finally {
  await browser.close();
  await site.close();
}
