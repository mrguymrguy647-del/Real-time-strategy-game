// Phone-sized screenshots of every screen, so UI changes can be looked at without a phone.
//   npm run screenshot                                 all screens, portrait and landscape
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
const only = option('--only', 'title,play,saves,settings,diagnostics').split(',');
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
    await context.close();
  }
} finally {
  await browser.close();
  await site.close();
}
