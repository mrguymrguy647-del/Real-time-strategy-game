// End-to-end tests of device-level behavior: the Diagnostics screen, the Phaser map benchmark,
// the service-worker update flow, and phone layout rules (no sideways scrolling, tap targets of
// at least 44 px) on three screen sizes.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goTo, newGame, openApp, t, waitForDiagnostics, waitForOffline } from '../../tools/lib/drive.mjs';
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

/** @param {import('playwright-core').Page} page */
const buildHash = (page) => page.evaluate(() => fetch('build-info.json').then((r) => r.json()).then((j) => j.hash));

describe('diagnostics', () => {
  it('reports a healthy device and can copy its report', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page, env.site.url);
    await waitForOffline(page);
    await newGame(page, 1);
    await goTo(page, 'diagnostics');
    await waitForDiagnostics(page);

    const status = (/** @type {string} */ id) => page.locator(`[data-check="${id}"]`).getAttribute('data-status');
    for (const id of ['build', 'sw', 'cache', 'storage', 'webgl']) assert.equal(await status(id), 'ok', `check "${id}"`);
    for (const id of ['mode', 'display', 'safeArea', 'update', 'persist', 'usage', 'saves', 'fps', 'cpu', 'turns']) {
      assert.notEqual(await status(id), 'fail', `check "${id}"`);
    }

    await button(page, t('diag.copyReport')).click();
    const report = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(report.includes(t('diag.report.title')));
    assert.ok(report.includes(t('diag.cache.label')));
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('runs the Phaser map benchmark and reports baked versus live drawing', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await goTo(page, 'diagnostics');
    await waitForDiagnostics(page);

    const row = page.locator('[data-check="mapBench"]');
    await button(row, t('diag.mapBench.run')).click();
    await page.waitForFunction(() => document.querySelector('[data-check="mapBench"]')?.getAttribute('data-status') !== 'info', null, { timeout: 120_000 });
    const text = (await row.textContent()) ?? '';
    assert.notEqual(await row.getAttribute('data-status'), 'fail', text);
    const phaser = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/phaser/VERSION.json'), 'utf8'));
    assert.ok(text.includes(`Phaser ${phaser.version}`), text);
    assert.ok(/redrawn every frame: \d+ fps/.test(text) && /drawn once as a texture: \d+ fps/.test(text), text);
    assert.equal(await page.locator('.bench-overlay').isHidden(), true, 'the benchmark screen closes itself');
    assert.deepEqual(problems, []);
    await context.close();
  });
});

describe('updates', () => {
  it('offers a new version and switches to it only when the player asks', async () => {
    // A second release: a copy of the source tree with one visible change.
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-release2-'));
    try {
      for (const entry of ['package.json', 'index.html', 'src', 'data', 'vendor', 'assets', 'tools/sw.template.js']) {
        fs.cpSync(path.join(ROOT, entry), path.join(copy, entry), { recursive: true });
      }
      fs.appendFileSync(path.join(copy, 'src/ui/theme.css'), '\n/* release 2 */\n');

      const { context, page } = await freshPage(env.browser);
      await openApp(page, env.site.url);
      await waitForOffline(page);
      const first = await buildHash(page);

      env.site.rebuild(copy); // the "new release" is now what the server has
      await goTo(page, 'settings');
      await button(page, t('settings.updates.check')).click();
      await page.waitForSelector('.toast__action');
      assert.equal(await buildHash(page), first, 'the running app stays on the old version until asked');

      await page.locator('.toast__action').click();
      await page.waitForFunction((old) => fetch('build-info.json').then((r) => r.json()).then((j) => j.hash !== old), first, { timeout: 20_000 });
      await page.waitForSelector('.screen'); // the page reloaded onto the new version and is running
      await context.close();
      env.site.rebuild(); // restore the real release for the remaining tests
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe('phone layout', () => {
  for (const kind of /** @type {const} */ (['portrait', 'landscape', 'small'])) {
    it(`fits the ${kind} screen: no sideways scrolling, tap targets of at least 44 px`, async () => {
      const { context, page, problems } = await freshPage(env.browser, kind);
      await openApp(page, env.site.url);

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

      await check('title');
      await newGame(page, 1);
      await check('play');
      for (const route of ['saves', 'settings', 'diagnostics']) {
        await goTo(page, route);
        if (route === 'diagnostics') await waitForDiagnostics(page);
        else await page.waitForTimeout(300);
        await check(route);
      }
      assert.deepEqual(problems, []);
      await context.close();
    });
  }
});
