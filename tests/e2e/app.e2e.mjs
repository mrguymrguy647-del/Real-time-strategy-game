// End-to-end tests of the app in a phone-sized Chromium, served under a subpath like GitHub Pages.
// They cover the Phase 0b "done when" list: boots, works offline, saves survive a reload,
// determinism after loading, export/import, and graceful failures.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goTo, newGame, openApp, t, waitForOffline, waitForSaved } from '../../tools/lib/drive.mjs';
import { button, freshPage, startEnvironment, stopEnvironment } from './helpers.mjs';

/** @type {Awaited<ReturnType<typeof startEnvironment>>} */
let env;
before(async () => {
  env = await startEnvironment();
});
after(async () => {
  await stopEnvironment(env);
});

describe('the app', () => {
  it('boots under a subpath with no errors', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    assert.equal(await page.title(), t('app.title'));
    assert.equal(await page.locator('#splash').count(), 0, 'the loading splash is gone');
    assert.ok(new URL(page.url()).pathname.startsWith(env.site.base));
    await button(page, t('title.newGame')).waitFor();
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('falls back to the title for unknown routes and for #/play without a game', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    for (const route of ['nope', 'play']) {
      await goTo(page, route);
      await page.waitForSelector('.title');
    }
    await context.close();
  });

  it('works offline after the first visit', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await waitForOffline(page);
    await page.waitForSelector('[data-offline="ok"]');

    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.title');
    await newGame(page, 2);
    assert.ok((await page.textContent('.play__date')).includes(t('month.3')));
    assert.deepEqual(problems.filter((p) => !/ERR_INTERNET_DISCONNECTED/.test(p)), []);
    await context.close();
  });

  it('keeps the game across a reload and replays the same dice after loading a save', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 3);
    await button(page, t('play.save')).click(); // manual slot 1, at turn 3 (April)
    await button(page, t('play.endTurn')).click(); // turn 4 (May)
    const rollAtTurn4 = await page.textContent('.play__roll');
    await waitForSaved(page, 4); // saving is asynchronous; let it finish before closing the page

    // Close and reopen: Continue brings back the newest autosave (turn 4).
    await page.reload();
    await page.getByRole('button', { name: t('title.continue') }).click();
    await page.waitForSelector('.play');
    assert.ok((await page.textContent('.play__date')).includes(t('month.5')));
    assert.equal(await page.textContent('.play__roll'), rollAtTurn4);

    // Load the older save from the Saves screen and end the same turn again: the same roll comes up.
    await button(page, t('play.menu')).click();
    await button(page, t('play.menu.saves')).click();
    await button(page.locator('[data-slot="manual-1"]'), t('common.load')).click();
    await page.waitForSelector('.play');
    assert.ok((await page.textContent('.play__date')).includes(t('month.4')));
    await button(page, t('play.endTurn')).click();
    assert.equal(await page.textContent('.play__roll'), rollAtTurn4, 'save, load and replay give the same dice');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('exports a save to a file and imports it into another slot', async () => {
    const { context, page } = await freshPage(env.browser, 'portrait', { acceptDownloads: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-e2e-files-'));
    try {
      await openApp(page, env.site.url);
      await newGame(page, 2);
      await goTo(page, 'saves');
      await page.waitForSelector('[data-slot="auto-2"]');

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        button(page.locator('[data-slot="auto-2"]'), t('common.export')).click(),
      ]);
      assert.equal(download.suggestedFilename(), 'grand-strategy_turn-2_2026-03.gsave');
      const file = path.join(tmp, download.suggestedFilename());
      await download.saveAs(file);
      assert.equal(fs.readFileSync(file)[0], 0x1f, 'the file is gzip-compressed');

      const slot3 = t('saves.slot.manual', { n: 3 });
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button(page, t('saves.import.button')).click()]);
      await chooser.setFiles(file);
      await button(page, t('saves.import.empty', { slot: slot3 })).click();
      const row = page.locator('[data-slot="manual-3"]');
      await button(row, t('common.load')).waitFor();
      assert.ok((await row.textContent()).includes(`${t('month.3')} 2026`));

      // A file that is not a save is refused with a clear message.
      const junk = path.join(tmp, 'junk.txt');
      fs.writeFileSync(junk, 'this is not a save');
      const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), button(page, t('saves.import.button')).click()]);
      await chooser2.setFiles(junk);
      await button(page, t('saves.import.empty', { slot: t('saves.slot.manual', { n: 4 }) })).click();
      await page.getByText(t('saves.error.bad_file')).waitFor();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      await context.close();
    }
  });

  it('remembers the text size across reloads', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await goTo(page, 'settings');
    await button(page, t('settings.textSize.large')).click();
    const fontSize = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    await page.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '18.4px');
    await page.reload(); // the URL keeps its #/settings route, so Settings comes back
    await page.waitForSelector('.segmented');
    assert.equal(await fontSize(), '18.4px');
    await context.close();
  });

  it('rolls back a failing turn, explains it, and lets play continue', async () => {
    const { context, page } = await freshPage(env.browser);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApp(page, env.site.url);
    await newGame(page, 1);
    const dateBefore = await page.textContent('.play__date');

    await page.evaluate(() => {
      const game = /** @type {any} */ (globalThis).__app.ctx.session.game;
      game.systems.push({ id: 'broken', order: 1, cadence: 'any', step: () => { throw new Error('deliberate test failure'); } });
    });
    await button(page, t('play.endTurn')).click();
    await page.getByText(t('play.turnFailed.title')).waitFor();
    assert.ok((await page.locator('.dialog__details').inputValue()).includes('deliberate test failure'));
    await button(page, t('play.turnFailed.copy')).click();
    await page.getByText(t('common.copied')).waitFor();
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('deliberate test failure'));
    assert.equal(await page.textContent('.play__date'), dateBefore, 'the game is back at the start of the turn');

    await page.evaluate(() => {
      /** @type {any} */ (globalThis).__app.ctx.session.game.systems.pop();
    });
    await button(page, t('play.endTurn')).click();
    assert.notEqual(await page.textContent('.play__date'), dateBefore, 'the next turn works');
    await context.close();
  });

  it('shows a clear retry screen when game files cannot load, then recovers', async () => {
    const { context, page } = await freshPage(env.browser);
    let blocked = true;
    await page.route('**/data/balance.json', (route) => (blocked ? route.fulfill({ status: 500, body: 'nope' }) : route.continue()));
    await page.goto(env.site.url);
    await page.waitForSelector('.boot-error');
    assert.equal(await page.textContent('.boot-error h1'), t('app.bootFailed.title'));
    assert.ok((await page.textContent('[data-details]')).includes('data/balance.json'));
    blocked = false;
    await button(page, t('app.bootFailed.retry')).click();
    await page.waitForSelector('.title');
    await context.close();
  });
});
