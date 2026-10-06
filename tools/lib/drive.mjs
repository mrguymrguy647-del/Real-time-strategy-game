// Helpers that drive the real app in a browser, shared by the e2e tests and the screenshot tool.
// Button names come from data/i18n/en.json, so tests keep working when wording changes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setStrings, t } from '../../src/util/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
setStrings(JSON.parse(fs.readFileSync(path.join(root, 'data/i18n/en.json'), 'utf8')).strings);

/** Look up UI text the same way the app does. */
export { t };

/**
 * Open the app and wait until the title screen is up.
 * @param {import('playwright-core').Page} page
 * @param {string} url
 */
export async function openApp(page, url) {
  await page.goto(url);
  await page.waitForSelector('.title', { timeout: 15_000 });
}

/** @param {import('playwright-core').Page} page @param {string} route e.g. "diagnostics" */
export async function goTo(page, route) {
  await page.evaluate((r) => {
    location.hash = `#/${r}`;
  }, route);
  await page.waitForTimeout(150);
}

/**
 * Wait until a save of at least this turn has really been written. Saving is asynchronous (like on
 * a real phone), so tests wait for it before reloading or opening the Saves screen.
 * @param {import('playwright-core').Page} page @param {number} turn
 */
export async function waitForSaved(page, turn) {
  await page.waitForFunction(
    async (n) => {
      const list = await /** @type {any} */ (globalThis).__app.ctx.saves.list();
      return list.some((/** @type {any} */ s) => s.meta.turn >= n);
    },
    turn,
    { timeout: 10_000 },
  );
}

/**
 * Start a new game as a country (picked from the strip on the picker screen) and end `turns` turns,
 * then wait for the last autosave.
 * @param {import('playwright-core').Page} page @param {number} [turns] @param {string} [countryId]
 */
export async function newGame(page, turns = 0, countryId = 'TUR') {
  await page.getByRole('button', { name: t('title.newGame'), exact: true }).click();
  await page.locator(`.pick-strip [data-country="${countryId}"]`).click({ timeout: 30_000 });
  await page.locator('.sheet__play').click();
  await page.waitForSelector('.play-hud');
  for (let i = 0; i < turns; i++) await endTurn(page);
  if (turns > 0) await waitForSaved(page, turns);
}

/** Tap End turn. @param {import('playwright-core').Page} page */
export async function endTurn(page) {
  await page.getByRole('button', { name: t('play.endTurn'), exact: true }).click();
}

/** Wait until every automatic Diagnostics check has finished. @param {import('playwright-core').Page} page */
export async function waitForDiagnostics(page) {
  await page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll('[data-check]')];
      return rows.length > 0 && rows.every((r) => !r.textContent?.includes('…'));
    },
    null,
    { timeout: 30_000 },
  );
}

/** Wait until the service worker controls the page (the app is ready for offline). @param {import('playwright-core').Page} page */
export async function waitForOffline(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20_000 });
}
