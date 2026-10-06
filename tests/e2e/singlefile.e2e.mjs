// End-to-end tests of the single-file download (T-18): the page is opened straight from disk, the
// way a phone opens a downloaded file, in a phone-sized browser. Also opened inside a locked-down
// frame (no storage, like an in-app viewer) to prove the game still plays there.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions } from '../../tools/lib/browser.mjs';
import { bundleSingle } from '../../tools/bundle-single.mjs';
import { goTo, newGame, t, waitForDiagnostics } from '../../tools/lib/drive.mjs';
import { ROOT } from '../helpers/data.js';
import { button, freshPage } from './helpers.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-single-e2e-'));
const file = path.join(tmp, 'grand-strategy.html');
/** @type {import('playwright-core').Browser} */
let browser;

before(async () => {
  fs.writeFileSync(file, bundleSingle().html);
  browser = await chromium.launch(launchOptions());
});
after(async () => {
  await browser?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const status = (/** @type {import('playwright-core').Page | import('playwright-core').Frame} */ where, /** @type {string} */ id) => where.locator(`[data-check="${id}"]`).getAttribute('data-status');

describe('the downloaded file', () => {
  it('opens from disk and says what it is: a copy that works offline but cannot be installed', async () => {
    const { context, page, problems } = await freshPage(browser);
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector('.title');
    const text = (await page.locator('.title').textContent()) ?? '';
    assert.ok(text.includes(t('title.singleFile')), 'the notice about being a downloaded copy');
    assert.ok(text.includes(t('title.offline.file')));
    assert.equal(text.includes(t('title.install.button')), false, 'no Install button');
    assert.equal(text.includes(t('title.offline.pending')), false, 'no waiting for an offline worker that will never come');
    assert.equal(await page.evaluate(() => 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller)), false);
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('shows the map: the engine travels inside the file, and a tap on a country opens its panel', async () => {
    const { context, page, problems } = await freshPage(browser);
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector('.title');
    await button(page, t('title.map')).click();
    await page.waitForFunction(() => Boolean(/** @type {any} */ (globalThis).__map?.info().ready), null, { timeout: 30_000 });
    const info = await page.evaluate(() => /** @type {any} */ (globalThis).__map.info());
    assert.equal(info.webgl, true);
    assert.equal(info.phaser, JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/phaser/VERSION.json'), 'utf8')).version);

    const [x, y] = await page.evaluate(() => {
      const map = /** @type {any} */ (globalThis).__map;
      const label = map.geometry.regions.find((/** @type {any} */ r) => r.id === 'IRN-fars_bushehr').label;
      const view = map.getView();
      const rect = map.root.getBoundingClientRect();
      return [rect.left + rect.width / 2 + (label[0] - view.cx) * view.zoom, rect.top + rect.height / 2 + (label[1] - view.cy) * view.zoom];
    });
    await page.touchscreen.tap(x, y);
    await page.waitForSelector('.sheet:not([hidden])');
    assert.ok(((await page.locator('.sheet').textContent()) ?? '').includes('Tehran'), 'the panel shows Iran\'s capital');
    await button(page, t('common.back')).click();
    await page.waitForSelector('.title');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('plays: new game, turns, autosaves, the Saves screen and Settings', async () => {
    const { context, page, problems } = await freshPage(browser);
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector('.title');
    await newGame(page, 3);
    assert.ok(((await page.locator('.play').textContent()) ?? '').includes('April 2026'), 'three months have passed');

    await goTo(page, 'saves');
    await page.waitForSelector('.screen');
    const saves = (await page.locator('.screen').textContent()) ?? '';
    assert.ok(saves.includes('turn 3'), saves);

    await goTo(page, 'settings');
    const settings = (await page.locator('.screen').textContent()) ?? '';
    assert.ok(settings.includes(t('settings.updates.file')), 'explains that a copy cannot update itself');
    assert.equal(await button(page, t('settings.updates.check')).count(), 0, 'no update button that could never work');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('shows honest Diagnostics: the offline checks are not applicable, the rest is real', async () => {
    const { context, page, problems } = await freshPage(browser);
    await page.goto(pathToFileURL(file).href);
    await page.waitForSelector('.title');
    await goTo(page, 'diagnostics');
    await waitForDiagnostics(page);
    for (const id of ['sw', 'cache', 'update']) assert.equal(await status(page, id), 'info', `check "${id}"`);
    for (const id of ['build', 'storage', 'webgl']) assert.equal(await status(page, id), 'ok', `check "${id}"`);
    assert.equal(await button(page.locator('[data-check="mapBench"]'), t('diag.mapBench.run')).count(), 1, 'the map speed test can be run from the file too, since the engine is inside it');
    assert.ok(((await page.locator('[data-check="mode"]').textContent()) ?? '').includes(t('diag.mode.file')));
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('keeps playing where the browser gives it no storage (a locked-down frame), and says so', async () => {
    // sandbox="allow-scripts" gives the page an opaque origin: IndexedDB and localStorage are refused.
    const wrapper = path.join(tmp, 'frame.html');
    fs.writeFileSync(wrapper, `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" src="${pathToFileURL(file).href}" style="border:0;width:100vw;height:100vh"></iframe></body>`);
    const { context, page } = await freshPage(browser);
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(pathToFileURL(wrapper).href);
    const frameElement = await page.waitForSelector('iframe');
    const frame = /** @type {import('playwright-core').Frame} */ (await frameElement.contentFrame());
    await frame.waitForSelector('.title', { timeout: 15_000 });
    assert.ok(((await frame.locator('.title').textContent()) ?? '').includes(t('title.storageMemory')), 'warns that saving is unavailable');

    await newGame(/** @type {any} */ (frame), 2);
    assert.ok(((await frame.locator('.play').textContent()) ?? '').includes('March 2026'));
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  it('shows the map even in a locked-down frame, where the engine is loaded from a blob', async () => {
    const wrapper = path.join(tmp, 'frame-map.html');
    fs.writeFileSync(wrapper, `<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" src="${pathToFileURL(file).href}" style="border:0;width:100vw;height:100vh"></iframe></body>`);
    const { context, page } = await freshPage(browser);
    /** @type {string[]} */
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(pathToFileURL(wrapper).href);
    const frame = /** @type {import('playwright-core').Frame} */ (await (await page.waitForSelector('iframe')).contentFrame());
    await frame.waitForSelector('.title', { timeout: 15_000 });
    await frame.getByRole('button', { name: t('title.map'), exact: true }).click();
    await frame.waitForFunction(() => Boolean(/** @type {any} */ (globalThis).__map?.info().frames), null, { timeout: 30_000 });
    assert.equal(await frame.evaluate(() => /** @type {any} */ (globalThis).__map.info().webgl), true);
    assert.equal(await frame.locator('.map-status').isHidden(), true, 'no error message in place of the map');
    assert.deepEqual(pageErrors, []);
    await context.close();
  });
});
