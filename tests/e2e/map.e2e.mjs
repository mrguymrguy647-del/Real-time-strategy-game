// End-to-end tests of the interactive map on a phone-sized screen: it draws with Phaser on WebGL, a tap
// on a country opens its info panel, one finger pans, two fingers pinch-zoom, and the panel fits every
// phone layout. Fingers are real touch events sent through the browser's devtools protocol: the same
// events a phone produces, so they go through the app's own pointer handling.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { t } from '../../tools/lib/drive.mjs';
import { ROOT } from '../helpers/data.js';
import { button, freshPage, startEnvironment, stopEnvironment } from './helpers.mjs';

/** @type {Awaited<ReturnType<typeof startEnvironment>>} */
let env;
before(async () => {
  env = await startEnvironment();
});
after(async () => {
  await stopEnvironment(env);
});

const readData = (/** @type {string} */ file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8')).items;
const countries = readData('countries.json');
const regions = readData('regions.json');

/** Open the map screen from the title screen and wait until it has drawn its first frame. @param {import('playwright-core').Page} page @param {string} url */
async function openMap(page, url) {
  await page.goto(url);
  await page.waitForSelector('.title');
  await button(page, t('title.map')).click();
  await page.waitForFunction(() => Boolean(/** @type {any} */ (globalThis).__map?.info().frames), null, { timeout: 30_000 });
}

/** Where a world point is on the screen, in page CSS pixels. @param {import('playwright-core').Page} page @param {[number, number]} world @returns {Promise<[number, number]>} */
function screenOf(page, world) {
  return page.evaluate(([wx, wy]) => {
    const map = /** @type {any} */ (globalThis).__map;
    const view = map.getView();
    const rect = map.root.getBoundingClientRect();
    return [rect.left + rect.width / 2 + (wx - view.cx) * view.zoom, rect.top + rect.height / 2 + (wy - view.cy) * view.zoom];
  }, world);
}

/** The point a region's name is drawn at, which is always inside the region. @param {import('playwright-core').Page} page @param {string} regionId @returns {Promise<[number, number]>} */
async function insideRegion(page, regionId) {
  const world = await page.evaluate((id) => /** @type {any} */ (globalThis).__map.geometry.regions.find((/** @type {any} */ r) => r.id === id).label, regionId);
  return screenOf(page, world);
}

/** @param {import('playwright-core').Page} page */
const selection = (page) => page.evaluate(() => /** @type {any} */ (globalThis).__map.getSelection());

/** @param {import('playwright-core').Page} page */
const view = (page) => page.evaluate(() => /** @type {any} */ (globalThis).__map.getView());

/** Zoom in without moving, so there is room to pan. @param {import('playwright-core').Page} page @param {number} zoom */
async function zoomTo(page, zoom) {
  await page.evaluate((z) => /** @type {any} */ (globalThis).__map.setView({ zoom: z }), zoom);
  await page.waitForTimeout(150);
}

/** Touch input as the browser's devtools send it: any number of fingers, moved in small steps. @param {import('playwright-core').Page} page */
async function touch(page) {
  const client = await page.context().newCDPSession(page);
  /** @param {string} type @param {Array<[number, number]>} points */
  const send = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  return {
    /** Put fingers down, move them in a straight line to the end points, and wait a moment before lifting (so there is no flick). @param {Array<[number, number]>} from @param {Array<[number, number]>} to */
    async drag(from, to, steps = 12) {
      await send('touchStart', from);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', from.map(([x, y], n) => [x + ((to[n][0] - x) * i) / steps, y + ((to[n][1] - y) * i) / steps]));
      }
      await page.waitForTimeout(200);
      await send('touchEnd', []);
    },
  };
}

describe('the map screen', () => {
  it('draws the Middle East with Phaser on WebGL, with no console errors', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    const info = await page.evaluate(() => /** @type {any} */ (globalThis).__map.info());
    const phaser = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/phaser/VERSION.json'), 'utf8'));
    assert.equal(info.webgl, true);
    assert.equal(info.phaser, phaser.version);
    assert.equal(info.layer, 'map-low', 'the small texture is used while zoomed out');
    assert.ok(await page.locator('.map-status').isHidden(), 'the loading message is gone');
    assert.equal(await page.locator('.sheet').isHidden(), true, 'no panel before anything is tapped');
    assert.equal(await page.locator('canvas').count(), 1, 'one canvas for the whole map');
    // Country names are HTML text over the map: the big countries are named at the first view.
    const names = (await page.locator('.map__label:not([hidden])').allTextContents()).join('|');
    for (const id of ['IRN', 'SAU', 'EGY']) assert.ok(names.includes(countries.find((/** @type {any} */ c) => c.id === id).name), `${id} is labelled: ${names}`);
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('opens the info panel for a tapped country and shows its facts', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    const [x, y] = await insideRegion(page, 'IRN-fars_bushehr');
    await page.touchscreen.tap(x, y);
    await page.waitForSelector('.sheet:not([hidden])');
    assert.deepEqual(await selection(page), { countryId: 'IRN', regionId: 'IRN-fars_bushehr' });

    const iran = countries.find((/** @type {any} */ c) => c.id === 'IRN');
    const fars = regions.find((/** @type {any} */ r) => r.id === 'IRN-fars_bushehr');
    const text = (await page.locator('.sheet').textContent()) ?? '';
    for (const expected of [iran.name, iran.capital.name, fars.name, t('map.panel.capital'), t('map.panel.population'), t('map.panel.terrain'), t('map.panel.cities')]) {
      assert.ok(text.includes(expected), `the panel mentions "${expected}": ${text}`);
    }
    assert.equal(/null|undefined|NaN/.test(text), false, `no leftovers in the panel: ${text}`);
    assert.equal(await page.locator('.sheet__region').count(), 1, 'the tapped region has its own section');
    assert.equal(await page.locator('.chip').count(), regions.filter((/** @type {any} */ r) => r.country === 'IRN').length, 'one chip per region of the country');
    assert.equal(await page.locator('.chip.is-active').getAttribute('data-region'), 'IRN-fars_bushehr');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('frames the tapped country in the part of the screen the panel leaves free', async () => {
    for (const kind of /** @type {const} */ (['portrait', 'landscape'])) {
      const { context, page, problems } = await freshPage(env.browser, kind);
      await openMap(page, env.site.url);
      const [x, y] = await insideRegion(page, 'IRN-fars_bushehr');
      await page.touchscreen.tap(x, y);
      await page.waitForSelector('.sheet:not([hidden])');
      await page.waitForTimeout(700); // the camera glide takes about a third of a second
      const sheet = await page.locator('.sheet').boundingBox();
      assert.ok(sheet);
      const [lx, ly] = await insideRegion(page, 'IRN-fars_bushehr');
      const covered = kind === 'portrait' ? ly >= sheet.y : lx >= sheet.x;
      assert.equal(covered, false, `${kind}: the tapped region is not hidden behind the panel`);
      const box = await page.evaluate(() => {
        const map = /** @type {any} */ (globalThis).__map;
        const iran = map.geometry.countries.find((/** @type {any} */ c) => c.id === 'IRN').box;
        const view = map.getView();
        const rect = map.root.getBoundingClientRect();
        const toScreen = (/** @type {number} */ wx, /** @type {number} */ wy) => [rect.left + rect.width / 2 + (wx - view.cx) * view.zoom, rect.top + rect.height / 2 + (wy - view.cy) * view.zoom];
        const [left, top] = toScreen(iran.minX, iran.minY);
        const [right, bottom] = toScreen(iran.maxX, iran.maxY);
        return { left, top, right, bottom };
      });
      const limit = kind === 'portrait' ? { right: 390, bottom: sheet.y } : { right: sheet.x, bottom: 390 };
      assert.ok(box.left >= -2 && box.top >= -2 && box.right <= limit.right + 2 && box.bottom <= limit.bottom + 2, `${kind}: all of Iran is in the free part ${JSON.stringify(box)} within ${JSON.stringify(limit)}`);
      assert.deepEqual(problems, []);
      await context.close();
    }
  });

  it('jumps straight to the tapped country when the phone asks for reduced motion', async () => {
    const { context, page, problems } = await freshPage(env.browser, 'portrait', { reducedMotion: 'reduce' });
    await openMap(page, env.site.url);
    const before = await view(page);
    await page.touchscreen.tap(...(await insideRegion(page, 'IRN-fars_bushehr')));
    await page.waitForSelector('.sheet:not([hidden])');
    await page.waitForTimeout(120); // a glide takes about 320 ms; a jump is done in a frame or two
    const soon = await view(page);
    await page.waitForTimeout(700);
    const settled = await view(page);
    assert.notEqual(settled.zoom, before.zoom, 'the camera did move to frame the country');
    assert.ok(Math.abs(soon.zoom - settled.zoom) < 1e-6 && Math.abs(soon.cx - settled.cx) < 0.5 && Math.abs(soon.cy - settled.cy) < 0.5, `already there: ${JSON.stringify(soon)} vs ${JSON.stringify(settled)}`);
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('switches regions from the chips, and a tap on the sea or the close button clears the selection', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    const [x, y] = await insideRegion(page, 'SAU-riyadh');
    await page.touchscreen.tap(x, y);
    await page.waitForSelector('.sheet:not([hidden])');
    assert.equal((await selection(page)).countryId, 'SAU');

    const other = regions.find((/** @type {any} */ r) => r.country === 'SAU' && r.id !== 'SAU-riyadh');
    await page.locator(`.chip[data-region="${other.id}"]`).click();
    assert.deepEqual(await selection(page), { countryId: 'SAU', regionId: other.id });
    assert.ok(((await page.locator('.sheet__region').textContent()) ?? '').includes(other.name));

    await button(page, t('map.panel.close')).click();
    assert.deepEqual(await selection(page), { countryId: null, regionId: null });
    assert.equal(await page.locator('.sheet').isHidden(), true);

    // Reopen, then tap open sea (a corner of the map, where only the faded neighbours are).
    await page.touchscreen.tap(...(await insideRegion(page, 'EGY-sinai')));
    await page.waitForSelector('.sheet:not([hidden])');
    await page.evaluate(() => /** @type {any} */ (globalThis).__map.resetView());
    await page.waitForTimeout(600);
    await page.touchscreen.tap(...(await screenOf(page, [60, 60])));
    await page.waitForTimeout(200);
    assert.deepEqual(await selection(page), { countryId: null, regionId: null }, 'a tap on the sea selects nothing');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('scrolls the row of region chips sideways with a finger, and the last chip can be tapped', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    await page.touchscreen.tap(...(await insideRegion(page, 'IRN-fars_bushehr')));
    await page.waitForSelector('.sheet:not([hidden])');
    await page.waitForTimeout(500);
    const row = page.locator('.chips');
    const room = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
    assert.ok(room > 100, `a country with 11 regions has more chips than fit on a phone (${room}px of overflow)`);

    const box = await row.boundingBox();
    assert.ok(box);
    const y = box.y + box.height / 2;
    const fingers = await touch(page);
    await fingers.drag([[box.x + box.width - 30, y]], [[box.x + 30, y]]);
    await page.waitForTimeout(400);
    const scrolled = await row.evaluate((el) => el.scrollLeft);
    assert.ok(scrolled > 100, `the row followed the finger: scrolled ${scrolled}px`);
    for (let i = 0; i < 12 && (await row.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft)) > 2; i++) {
      await fingers.drag([[box.x + box.width - 30, y]], [[box.x + 30, y]]); // keep swiping until the end of the row
      await page.waitForTimeout(300);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, true, 'the page itself did not move sideways');

    const last = regions.filter((/** @type {any} */ r) => r.country === 'IRN').at(-1);
    const chip = page.locator(`.chip[data-region="${last.id}"]`);
    const chipBox = await chip.boundingBox();
    assert.ok(chipBox && chipBox.x >= 0 && chipBox.x + chipBox.width <= 391, 'the last chip is now fully on screen');
    await page.touchscreen.tap(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2);
    assert.deepEqual(await selection(page), { countryId: 'IRN', regionId: last.id });
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('pans with one finger: the map follows the finger', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    await zoomTo(page, 0.6);
    const before = await view(page);
    const fingers = await touch(page);
    await fingers.drag([[250, 500]], [[130, 560]]); // 120 px left, 60 px down
    const after = await view(page);
    assert.equal(after.zoom, before.zoom, 'panning does not zoom');
    const tolerance = 3 / before.zoom;
    assert.ok(Math.abs(after.cx - (before.cx + 120 / before.zoom)) <= tolerance, `dragging left shows more of what is to the right: ${before.cx} -> ${after.cx}`);
    assert.ok(Math.abs(after.cy - (before.cy - 60 / before.zoom)) <= tolerance, `dragging down shows more of what is above: ${before.cy} -> ${after.cy}`);
    assert.deepEqual(await selection(page), { countryId: null, regionId: null }, 'a drag is not a tap');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('zooms with two fingers, keeping the point between them in place', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    await zoomTo(page, 0.4);
    const before = await view(page);
    const [mx, my] = [195, 420];
    const [worldBefore] = await page.evaluate(([x, y]) => {
      const map = /** @type {any} */ (globalThis).__map;
      const v = map.getView();
      const rect = map.root.getBoundingClientRect();
      return [[v.cx + (x - rect.left - rect.width / 2) / v.zoom, v.cy + (y - rect.top - rect.height / 2) / v.zoom]];
    }, [mx, my]);

    const fingers = await touch(page);
    await fingers.drag([[mx - 50, my], [mx + 50, my]], [[mx - 100, my], [mx + 100, my]]); // fingers twice as far apart
    const after = await view(page);
    assert.ok(Math.abs(after.zoom / before.zoom - 2) < 0.05, `zoom doubled: ${before.zoom} -> ${after.zoom}`);

    const [wx, wy] = [after.cx + (mx - 195) / after.zoom, after.cy + (my - 422) / after.zoom];
    assert.ok(Math.abs(wx - worldBefore[0]) < 3 / after.zoom && Math.abs(wy - worldBefore[1]) < 3 / after.zoom, `the point between the fingers stayed put: ${worldBefore} -> ${[wx, wy]}`);
    assert.deepEqual(await selection(page), { countryId: null, regionId: null }, 'a pinch is not a tap');

    await fingers.drag([[mx - 100, my], [mx + 100, my]], [[mx - 50, my], [mx + 50, my]]); // and back out
    const out = await view(page);
    assert.ok(Math.abs(out.zoom / before.zoom - 1) < 0.05, `pinching in undoes it: ${out.zoom}`);
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('uses the sharp texture when zoomed in and the small one when zoomed out', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    const layer = () => page.evaluate(() => /** @type {any} */ (globalThis).__map.info().layer);
    await zoomTo(page, 1.2);
    await page.waitForFunction(() => /** @type {any} */ (globalThis).__map.info().layer === 'map-high', null, { timeout: 15_000 });
    await page.evaluate(() => /** @type {any} */ (globalThis).__map.resetView());
    await page.waitForFunction(() => /** @type {any} */ (globalThis).__map.info().layer === 'map-low', null, { timeout: 15_000 });
    assert.equal(await layer(), 'map-low');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('the Back button returns to the title screen, and the map can be opened again', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openMap(page, env.site.url);
    await button(page, t('common.back')).click();
    await page.waitForSelector('.title');
    assert.equal(await page.evaluate(() => Boolean(/** @type {any} */ (globalThis).__map)), false, 'the map is torn down');
    assert.equal(await page.locator('canvas').count(), 0, 'and its canvas is gone');
    await button(page, t('title.map')).click();
    await page.waitForFunction(() => Boolean(/** @type {any} */ (globalThis).__map?.info().frames), null, { timeout: 30_000 });
    assert.deepEqual(problems, []);
    await context.close();
  });
});

describe('the map screen on every phone size', () => {
  for (const kind of /** @type {const} */ (['portrait', 'landscape', 'small'])) {
    it(`fits the ${kind} screen with the panel open: no sideways scrolling, tap targets of at least 44 px`, async () => {
      const { context, page, problems } = await freshPage(env.browser, kind);
      await openMap(page, env.site.url);

      /** @param {string} where */
      const check = async (where) => {
        const result = await page.evaluate(() => {
          const overflow = document.documentElement.scrollWidth - window.innerWidth;
          const tooSmall = [...document.querySelectorAll('button, a[href], input, select, textarea')]
            .filter((el) => {
              const box = el.getBoundingClientRect();
              const hidden = getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]');
              return box.width > 0 && box.height > 0 && !hidden && (box.width < 43.5 || box.height < 43.5);
            })
            .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
          return { overflow, tooSmall };
        });
        assert.ok(result.overflow <= 1, `${where}: the page is ${result.overflow}px wider than the screen`);
        assert.deepEqual(result.tooSmall, [], `${where}: tap targets under 44 px`);
      };

      await check('map');
      await page.touchscreen.tap(...(await insideRegion(page, 'IRN-fars_bushehr')));
      await page.waitForSelector('.sheet:not([hidden])');
      await page.waitForTimeout(500);
      await check('map with the panel');

      // The panel never takes more than about half the screen, so the map stays usable.
      const sheet = await page.locator('.sheet').boundingBox();
      const screen = /** @type {{ width: number, height: number }} */ (page.viewportSize());
      assert.ok(sheet);
      if (kind === 'landscape') assert.ok(sheet.width <= screen.width * 0.5, `side panel ${sheet.width}px of ${screen.width}px`);
      else assert.ok(sheet.height <= screen.height * 0.5, `bottom panel ${sheet.height}px of ${screen.height}px`);
      assert.deepEqual(problems, []);
      await context.close();
    });
  }
});
