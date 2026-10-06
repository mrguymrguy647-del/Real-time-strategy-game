// Phone-sized screenshots of every screen, so UI changes can be looked at without a phone.
//   npm run screenshot                                 all screens (the map, the picker, the game), portrait and landscape
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
const only = option('--only', 'title,pick,play,report,resources,region,budget,saves,settings,diagnostics,map').split(',');
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

    // The country picker: the strip of countries, then Iran chosen with its panel open.
    await page.getByRole('button', { name: t('title.newGame'), exact: true }).click();
    await page.waitForSelector('.pick-strip .chip', { timeout: 30_000 });
    await page.waitForFunction(() => globalThis.__map?.info().ready, null, { timeout: 30_000 });
    if (only.includes('pick')) await shot('pick');
    await page.locator('.pick-strip [data-country="IRN"]').click();
    await page.waitForSelector('.sheet__play');
    await page.waitForTimeout(900); // the camera glide
    if (only.includes('pick')) await shot('pick-iran');

    // The game: as Türkiye after three months, with the report that End turn opens, then the budget.
    await goTo(page, 'title');
    await newGame(page, 3);
    await page.waitForSelector('.report:not([hidden])');
    await page.waitForTimeout(900);
    if (only.includes('report')) await shot('report');
    if (only.includes('report')) {
      await page.locator('[data-line="growth"] .report__toggle').click();
      await page.locator('[data-line="interest"] .report__toggle').click();
      await shot('report-why');
      await page.evaluate(() => void (document.querySelector('.report').scrollTop = 1e6)); // the resources block is at the bottom
      await page.waitForTimeout(200);
      await shot('report-resources');
    }
    if (only.includes('resources')) {
      // The Resources panel: the first resources, then the straits with a "what if it closed?" open.
      await page.getByRole('button', { name: t('common.close'), exact: true }).first().click();
      await page.getByRole('button', { name: t('play.resources'), exact: true }).click();
      await page.waitForSelector('.resources:not([hidden]) .res');
      await page.waitForTimeout(300);
      await shot('resources');
      await page.locator('.resources .res__ladder summary').first().click();
      await page.evaluate(() => void (document.querySelector('.resources').scrollTop = 1e6));
      await page.locator('[data-strait="bab_el_mandeb"] .strait__toggle').click();
      await page.waitForSelector('[data-closure]');
      await page.evaluate(() => void (document.querySelector('.resources').scrollTop = 1e6));
      await page.waitForTimeout(300);
      await shot('resources-straits');
      await page.getByRole('button', { name: t('play.resources'), exact: true }).click(); // close it
    }
    if (only.includes('region')) {
      // A region of another country, with what holding it would be worth.
      await page.getByRole('button', { name: t('common.close'), exact: true }).first().click().catch(() => {});
      await page.evaluate(() => globalThis.__map.select('IRQ-basra'));
      await page.waitForSelector('.capture');
      await page.waitForTimeout(900);
      await shot('region-capture');
      await page.evaluate(() => void (document.querySelector('.sheet:not([hidden])').scrollTop = 1e6));
      await shot('region-capture-bottom');
      await page.locator('.sheet:not([hidden]) .sheet__close').click();
    }
    await page.getByRole('button', { name: t('play.budget'), exact: true }).click();
    await page.waitForSelector('.budget:not([hidden])');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: t('budget.raise', { name: t('budget.military') }), exact: true }).click();
    await page.waitForTimeout(300);
    if (only.includes('budget')) {
      await shot('budget');
      await page.evaluate(() => void (document.querySelector('.budget').scrollTop = 1e6)); // the debt section is at the bottom
      await page.waitForTimeout(200);
      await shot('budget-debt');
      await page.evaluate(() => void (document.querySelector('.budget').scrollTop = 0));
    }
    await page.getByRole('button', { name: t('play.budget'), exact: true }).click(); // close it
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
