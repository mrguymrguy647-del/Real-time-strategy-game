// End-to-end tests of playing a game on a phone-sized screen (Phase 1, M1.1b): choosing a country,
// ending a turn, reading the monthly report and its "why", setting the budget, and the layouts that
// keep the action bar and the panels from covering each other.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { endTurn, newGame, openApp, t, waitForSaved } from '../../tools/lib/drive.mjs';
import { button, freshPage, startEnvironment, stopEnvironment } from './helpers.mjs';

/** @type {Awaited<ReturnType<typeof startEnvironment>>} */
let env;
before(async () => {
  env = await startEnvironment();
});
after(async () => {
  await stopEnvironment(env);
});

/** The running game's state, read from the page. @param {import('playwright-core').Page} page @param {string} path e.g. "countries.TUR.economy.taxRate" */
const stateAt = (page, path) =>
  page.evaluate((p) => p.split('.').reduce((value, key) => value?.[key], /** @type {any} */ (globalThis).__app.ctx.session.game.state), path);

/** Open the picker and wait for the map and the strip of countries. @param {import('playwright-core').Page} page */
async function openPicker(page) {
  await button(page, t('title.newGame')).click();
  await page.waitForSelector('.pick-strip .chip', { timeout: 30_000 });
}

/** The screen position of the middle of a region's name, in page CSS pixels. @param {import('playwright-core').Page} page @param {string} regionId @returns {Promise<[number, number]>} */
function insideRegion(page, regionId) {
  return page.evaluate((id) => {
    const map = /** @type {any} */ (globalThis).__map;
    const label = map.geometry.regions.find((/** @type {any} */ r) => r.id === id).label;
    const view = map.getView();
    const rect = map.root.getBoundingClientRect();
    return [rect.left + rect.width / 2 + (label[0] - view.cx) * view.zoom, rect.top + rect.height / 2 + (label[1] - view.cy) * view.zoom];
  }, regionId);
}

/** Wait until the camera has stopped moving. @param {import('playwright-core').Page} page */
async function stillCamera(page) {
  let same = 0;
  let last = '';
  for (let i = 0; i < 60 && same < 3; i++) {
    await page.waitForTimeout(120);
    const now = JSON.stringify(await page.evaluate(() => /** @type {any} */ (globalThis).__map.getView()));
    same = now === last ? same + 1 : 0;
    last = now;
  }
}

describe('choosing a country', () => {
  it('lists the 16 playable countries, opens a panel with a Play button and starts the game as that country', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await openPicker(page);
    assert.equal(await page.locator('.pick-strip .chip').count(), 16);
    assert.equal(await page.locator('.sheet__play').count(), 0, 'nothing is chosen yet');

    await page.locator('.pick-strip [data-country="IRN"]').click();
    await page.waitForSelector('.sheet__play');
    assert.equal(await page.locator('.sheet__title').textContent(), 'Iran');
    assert.equal(await page.locator('.pick-strip [data-country="IRN"]').getAttribute('aria-pressed'), 'true');
    assert.ok((await page.locator('.sheet').textContent()).includes(t('map.panel.treasury')), 'the panel shows the money facts');

    await page.locator('.sheet__play').click();
    await page.waitForSelector('.play-hud');
    assert.equal(await page.locator('.play-hud__name').textContent(), 'Iran');
    assert.equal(await stateAt(page, 'player.countryId'), 'IRN');
    const outline = await page.locator('.map__sel--own').getAttribute('d');
    assert.ok(outline && outline.length > 100, 'the player\'s own country is outlined on the map');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('still lets you choose and play when the map cannot be drawn', async () => {
    const { context, page } = await freshPage(env.browser);
    await page.route('**/data/map/middle_east.topo.json', (route) => route.fulfill({ status: 500, body: 'no map today' }));
    await openApp(page, env.site.url);
    await openPicker(page);
    await page.waitForSelector('.map-status:not([hidden])'); // the map says it could not be shown
    assert.ok((await page.locator('.map-status').textContent()).includes(t('map.failed', { error: '' }).slice(0, 20)));

    await page.locator('.pick-strip [data-country="JOR"]').click();
    await page.waitForSelector('.sheet__play');
    assert.equal(await page.locator('.sheet__title').textContent(), 'Jordan');
    assert.equal(await page.locator('.pick-strip [data-country="JOR"]').getAttribute('aria-pressed'), 'true');
    await page.locator('.sheet__play').click();
    await page.waitForSelector('.play-hud');
    assert.equal(await page.locator('.play-hud__name').textContent(), 'Jordan');

    // The game itself needs no map: the budget, End turn and the report all work.
    await button(page, t('play.budget')).click();
    await button(page, t('budget.raise', { name: t('budget.tax') })).click();
    await endTurn(page);
    await page.waitForSelector('.report:not([hidden])');
    assert.ok((await page.textContent('.play-hud__date')).includes(t('month.2')));
    await context.close();
  });

  it('also chooses by tapping a country on the map, and refuses the grey world', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await openPicker(page);
    await page.waitForFunction(() => Boolean(/** @type {any} */ (globalThis).__map?.info().ready), null, { timeout: 30_000 });
    await stillCamera(page);

    const [x, y] = await insideRegion(page, 'SAU-riyadh');
    await page.touchscreen.tap(x, y);
    await page.waitForSelector('.sheet__play');
    assert.equal(await page.locator('.sheet__title').textContent(), 'Saudi Arabia');
    assert.equal(await page.locator('.pick-strip [data-country="SAU"]').getAttribute('aria-pressed'), 'true', 'the strip follows the map');

    // Ukraine is drawn in grey: it can be looked at, but not played.
    await page.evaluate(() => /** @type {any} */ (globalThis).__map.selectWorld('UKR'));
    await page.waitForFunction(() => /** @type {any} */ (globalThis).__map.getSelection().world === true);
    assert.ok((await page.locator('.sheet').textContent()).includes(t('map.panel.notPlayable')));
    assert.equal(await page.locator('.sheet__play').count(), 0);
    await context.close();
  });

  it('leaves the empty part of the top bar to the map, so it can still be dragged there', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await openPicker(page);
    const width = /** @type {{ width: number }} */ (page.viewportSize()).width;
    const covered = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('.map-top')), [width - 12, 36]);
    assert.equal(covered, false, 'the corner beside the title belongs to the map');
    const onTitle = await page.evaluate(() => Boolean(document.elementFromPoint(100, 40)?.closest('.map-top')));
    assert.equal(onTitle, true, 'but the Back button is still a button');
    await context.close();
  });

  it('goes back to the title screen', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await openPicker(page);
    await button(page, t('common.back')).click();
    await page.waitForSelector('.title');
    await context.close();
  });
});

describe('a month of play', () => {
  it('ends the turn, opens the monthly report, and explains a line when it is tapped', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    assert.ok((await page.textContent('.play-hud__date')).includes(`${t('month.1')} 2026`));
    assert.equal(await page.locator('.report:not([hidden])').count(), 0, 'no report before the first turn');
    const treasuryBefore = await page.textContent('.play-hud__treasury');

    await endTurn(page);
    await page.waitForSelector('.report:not([hidden])');
    assert.ok((await page.textContent('.play-hud__date')).includes(`${t('month.2')} 2026`));
    assert.ok((await page.locator('.report .sheet__title').textContent()).includes(`${t('month.1')} 2026`), 'the report is for the month that just ended');
    for (const line of ['taxes', 'spending', 'interest', 'balance', 'growth']) assert.equal(await page.locator(`[data-line="${line}"]`).count(), 1, line);
    assert.ok(treasuryBefore, 'the strip shows the treasury');
    const change = await page.textContent('.play-hud__change');
    assert.match(change, /^\u2212\$\d+ million$/, 'and what the month did to it (Türkiye starts with a small deficit)');

    // "Why?": tapping the income line shows the GDP and the tax rate it is made of, and again closes it.
    await page.locator('[data-line="taxes"] .report__toggle').click();
    const why = page.locator('[data-line="taxes"] .why');
    await why.waitFor();
    const text = await why.textContent();
    assert.ok(text.includes(t('why.taxes.gdp')) && text.includes(t('why.taxes.taxRate')) && text.includes(t('why.total')));
    assert.ok(text.includes('27%'), 'Türkiye starts with a 27% tax rate');
    await page.locator('[data-line="taxes"] .report__toggle').click();
    assert.equal(await why.count(), 0);

    // Close, and bring it back with the Report button.
    await button(page, t('common.close')).click();
    assert.equal(await page.locator('.report:not([hidden])').count(), 0);
    await button(page, t('play.report')).click();
    await page.waitForSelector('.report:not([hidden])');
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('keeps the action bar free: the report never covers End turn', async () => {
    for (const kind of /** @type {const} */ (['portrait', 'landscape', 'small'])) {
      const { context, page } = await freshPage(env.browser, kind);
      await openApp(page, env.site.url);
      await newGame(page, 1, 'TUR');
      await page.waitForSelector('.report:not([hidden])');
      const viewport = /** @type {{ width: number, height: number }} */ (page.viewportSize());
      const end = /** @type {any} */ (await button(page, t('play.endTurn')).boundingBox());
      const sheet = /** @type {any} */ (await page.locator('.report').boundingBox());
      assert.ok(end.height >= 44 && end.y + end.height <= viewport.height + 1, `${kind}: End turn is on screen and big enough`);
      assert.ok(sheet.y + sheet.height <= end.y + 1, `${kind}: the report sits above the bar (${sheet.y + sheet.height} <= ${end.y})`);
      await endTurn(page); // pressing it again with the report open just plays the next month
      await page.waitForFunction(() => document.querySelector('.play-hud__date')?.textContent?.includes('March'));
      await context.close();
    }
  });

  it('shows the live numbers of any country that is tapped, and opens the budget from your own', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 1, 'TUR');
    await button(page, t('common.close')).click(); // the report
    await page.waitForFunction(() => Boolean(/** @type {any} */ (globalThis).__map?.info().ready), null, { timeout: 30_000 });
    await stillCamera(page);

    await page.evaluate(() => /** @type {any} */ (globalThis).__map.select('IRN-tehran'));
    await page.waitForSelector('.sheet:not([hidden]) .sheet__title');
    assert.equal(await page.locator('.sheet:not([hidden]) .sheet__title').textContent(), 'Iran');
    assert.equal(await page.locator('.sheet__play').count(), 0, 'no Budget button on someone else\'s country');

    await page.evaluate(() => /** @type {any} */ (globalThis).__map.select('TUR-central_anatolia'));
    await page.waitForFunction(() => document.querySelector('.sheet:not([hidden]) .sheet__title')?.textContent === 'Türkiye');
    await page.locator('.sheet__play').click();
    await page.waitForSelector('.budget:not([hidden])');
    assert.equal(await page.locator('.sheet:not([hidden])').count(), 1, 'one panel at a time');
    await context.close();
  });
});

describe('panels', () => {
  it('say which panel is open: tapping a country replaces the report, and the Report button stops looking pressed', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 1, 'TUR');
    await page.waitForSelector('.report:not([hidden])');
    const reportButton = button(page, t('play.report'));
    assert.equal(await reportButton.getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => Boolean(/** @type {any} */ (globalThis).__map?.info().ready), null, { timeout: 30_000 });

    await page.evaluate(() => /** @type {any} */ (globalThis).__map.select('IRN-tehran'));
    await page.waitForFunction(() => document.querySelector('.sheet:not([hidden]) .sheet__title')?.textContent === 'Iran');
    assert.equal(await page.locator('.report:not([hidden])').count(), 0, 'the report made way for the country');
    assert.equal(await reportButton.getAttribute('aria-pressed'), 'false');
    assert.equal(await button(page, t('play.budget')).getAttribute('aria-pressed'), 'false');

    await button(page, t('play.budget')).click();
    assert.equal(await button(page, t('play.budget')).getAttribute('aria-pressed'), 'true');
    assert.equal(await reportButton.getAttribute('aria-pressed'), 'false');
    await context.close();
  });

  it('leaving the game screen stops a held button from ordering anything more', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    await button(page, t('play.budget')).click();
    await page.waitForSelector('.budget:not([hidden])');
    const raise = button(page, t('budget.raise', { name: t('budget.tax') }));
    const box = /** @type {any} */ (await raise.boundingBox());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700); // the hold has started repeating
    // Go away without lifting the finger (a second finger on Menu, then Settings).
    await page.evaluate(() => void (location.hash = '#/settings'));
    await page.waitForSelector('.segmented');
    const before = /** @type {number} */ (await stateAt(page, 'countries.TUR.economy.taxRate'));
    await page.waitForTimeout(600);
    assert.equal(await stateAt(page, 'countries.TUR.economy.taxRate'), before, 'the repeat stopped when the screen went away');
    await page.mouse.up();
    await context.close();
  });
});

describe('the treasury', () => {
  it('moves every turn, with a decimal so a few hundred million show, even on a big treasury with a debt (Saudi Arabia)', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'SAU');
    const seen = [await page.textContent('.play-hud__treasury')];
    const changes = [];
    for (let turn = 1; turn <= 3; turn++) {
      await endTurn(page);
      await page.waitForFunction((n) => /** @type {any} */ (globalThis).__app.ctx.session.game.state.clock.turn === n, turn);
      seen.push(await page.textContent('.play-hud__treasury'));
      changes.push(await page.textContent('.play-hud__change'));
    }
    assert.equal(new Set(seen).size, seen.length, `a different treasury after every turn: ${seen.join(' | ')}`);
    assert.ok(seen.every((text) => /^Treasury \$4\d\d(\.\d)? billion$/.test(text)), seen.join(' | '));
    assert.ok(changes.every((text) => /^\+\$1\.\d billion$/.test(text)), `and what each month added: ${changes.join(' | ')}`);
    await context.close();
  });

  it('repays debt on a button: money moves from the treasury to the debt at once, and the strip follows', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    await button(page, t('play.budget')).click();
    await page.waitForSelector('.budget:not([hidden])');
    const economy = /** @type {{ treasuryMn: number, debtMn: number }} */ (await stateAt(page, 'countries.TUR.economy'));
    const forecastInterest = () => page.locator('.budget .fact', { hasText: t('report.interest') }).locator('dd').textContent();
    const interestBefore = await forecastInterest();
    assert.ok((await page.textContent('[data-debt]')).includes('30%'), 'Türkiye starts at 30% of GDP in debt');

    await page.locator('[data-repay="share"]').click();
    const after = /** @type {{ treasuryMn: number, debtMn: number }} */ (await stateAt(page, 'countries.TUR.economy'));
    assert.ok(Math.abs(after.debtMn - economy.debtMn * 0.9) < 1e-6 && Math.abs(economy.treasuryMn - after.treasuryMn - economy.debtMn * 0.1) < 1e-6, 'a tenth of the debt came out of the treasury');
    assert.match(await page.textContent('.play-hud__treasury'), /^Treasury \$111(\.\d)? billion$/, 'the strip follows at once');
    assert.ok((await page.textContent('[data-debt]')).includes('27%'));
    assert.notEqual(await forecastInterest(), interestBefore, 'and next month\'s interest is lower');
    assert.deepEqual((/** @type {any[]} */ (await stateAt(page, 'log'))).map((entry) => entry.type), ['REPAY_DEBT']);

    // "All you can": the treasury is emptied, and the buttons have nothing left to pay with.
    await page.locator('[data-repay="all"]').click();
    assert.equal(await stateAt(page, 'countries.TUR.economy.treasuryMn'), 0);
    assert.equal(await page.locator('[data-repay="share"]').isDisabled(), true);
    assert.equal(await page.locator('[data-repay="all"]').isDisabled(), true);
    // Less debt, less interest: the monthly shortfall Türkiye started with has turned into a small surplus.
    assert.match(await page.locator('.budget .fact', { hasText: t('report.balance') }).locator('dd').textContent(), /^\+/);
    await context.close();
  });
});

describe('the budget', () => {
  it('moves a lever one step at a time, as a command, and the forecast follows', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    await button(page, t('play.budget')).click();
    await page.waitForSelector('.budget:not([hidden])');

    const military = page.locator('[data-lever="military"]');
    const balance = () => page.locator('.budget .fact', { hasText: t('report.balance') }).locator('dd').textContent();
    assert.equal(await military.locator('[data-value]').textContent(), '2.1%');
    const balanceBefore = await balance();

    await button(page, t('budget.raise', { name: t('budget.military') })).click();
    assert.equal(await military.locator('[data-value]').textContent(), '2.6%');
    assert.equal(await stateAt(page, 'countries.TUR.budget.military'), 0.026);
    assert.notEqual(await balance(), balanceBefore, 'the forecast changed');
    assert.deepEqual(await stateAt(page, 'log'), [{ type: 'SET_BUDGET', countryId: 'TUR', category: 'military', share: 0.026, turn: 0 }], 'it went through the command log');

    await button(page, t('budget.lower', { name: t('budget.military') })).click();
    assert.equal(await balance(), balanceBefore, 'and back');

    // Taxes: 17%..37% around the 27% start, in half-point steps.
    await button(page, t('budget.raise', { name: t('budget.tax') })).click();
    assert.equal(await page.locator('[data-lever="tax"] [data-value]').textContent(), '27.5%');
    assert.equal(await stateAt(page, 'countries.TUR.economy.taxRate'), 0.275);

    // The next month uses what was ordered.
    await endTurn(page);
    await page.waitForSelector('.report:not([hidden])');
    await waitForSaved(page, 1);
    assert.equal(await stateAt(page, 'countries.TUR.economy.last.why.taxes.parts.1.value'), 0.275);
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('keeps stepping while a button is held down, and stops when it is let go', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    await button(page, t('play.budget')).click();
    await page.waitForSelector('.budget:not([hidden])');
    const raise = button(page, t('budget.raise', { name: t('budget.tax') }));
    const box = /** @type {any} */ (await raise.boundingBox());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1400);
    await page.mouse.up();
    const held = /** @type {number} */ (await stateAt(page, 'countries.TUR.economy.taxRate'));
    assert.ok(held >= 0.27 + 0.015, `three or more half-point steps while held (tax is now ${held})`);
    await page.waitForTimeout(500);
    assert.equal(await stateAt(page, 'countries.TUR.economy.taxRate'), held, 'nothing moves after the finger is lifted');
    const log = /** @type {any[]} */ (await stateAt(page, 'log'));
    assert.equal(new Set(log.map((entry) => entry.rate)).size, log.length, 'every logged order is a different rate');
    await context.close();
  });

  it('stops a lever at its limits', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    await button(page, t('play.budget')).click();
    await page.waitForSelector('.budget:not([hidden])');
    const lower = button(page, t('budget.lower', { name: t('budget.research') }));
    // 0.6% of GDP in quarter-point steps: three taps reach zero.
    for (let i = 0; i < 3; i++) await lower.click();
    assert.equal(await stateAt(page, 'countries.TUR.budget.research'), 0);
    assert.equal(await lower.isDisabled(), true);
    assert.equal(await page.locator('[data-lever="research"] [data-value]').textContent(), '0%');
    await context.close();
  });

  it('warns about a treasury that is running out, and what the state must borrow', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'YEM'); // a deficit every month, but a long runway at the start
    await button(page, t('play.budget')).click();
    await page.waitForSelector('.budget:not([hidden])');
    assert.equal(await page.locator('[data-alert]').count(), 0, 'plenty of months of money left');

    /** Set the treasury, then redraw the panel by moving a lever up and down. @param {number} millions */
    const treasury = async (millions) => {
      await page.evaluate((value) => void (/** @type {any} */ (globalThis).__app.ctx.session.game.state.countries.YEM.economy.treasuryMn = value), millions);
      await button(page, t('budget.raise', { name: t('budget.tax') })).click();
      await button(page, t('budget.lower', { name: t('budget.tax') })).click();
    };
    await treasury(100);
    await page.waitForSelector('[data-alert="runway"]');
    assert.match(await page.locator('[data-alert="runway"]').textContent(), /about \d+ months?/);

    await treasury(0);
    await page.waitForSelector('[data-alert="borrowing"]');
    assert.ok((await page.locator('[data-alert="borrowing"]').textContent()).includes('borrow'));
    await context.close();
  });
});

describe('damaged saves', () => {
  it('are refused when opened, with a message, instead of leaving a broken screen', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 1, 'TUR');
    await waitForSaved(page, 1);
    // Break the newest autosave the way a hand-edited file could: the player's country has no budget.
    await page.evaluate(async () => {
      const { storage, saves } = /** @type {any} */ (globalThis).__app.ctx;
      const [newest] = await saves.list();
      const record = await storage.get('saves', newest.slot);
      delete record.state.countries.TUR.budget;
      await storage.putMany([{ store: 'saves', key: newest.slot, value: record }]);
    });
    await page.reload();
    await page.waitForSelector('.title');
    await page.getByRole('button', { name: new RegExp(t('title.continue')) }).click();
    // The newest save is damaged, so Continue loads the older one (the autosave from the start of the game) and says so.
    await page.waitForSelector('.play-hud');
    await page.getByText(t('title.skipped', { slots: 'auto-2' })).waitFor();
    await context.close();
  });
});

describe('old test saves', () => {
  it('are not offered by Continue, and say why when loaded', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await page.evaluate(async () => {
      const { storage } = /** @type {any} */ (globalThis).__app.ctx;
      const meta = { countryId: null, year: 2026, month: 3, week: 1, turn: 2, scenarioId: 'scaffold_test', difficulty: 'normal' };
      await storage.putMany([
        { store: 'saves', key: 'manual-1', value: { slot: 'manual-1', savedAt: 1, saveVersion: 1, dataVersion: 'old', meta, state: { meta: { saveVersion: 1 } } } },
        { store: 'slots', key: 'manual-1', value: { slot: 'manual-1', savedAt: 1, saveVersion: 1, dataVersion: 'old', meta } },
      ]);
    });
    await page.reload();
    await page.waitForSelector('.title');
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('button', { name: new RegExp(t('title.continue')) }).count(), 0, 'nothing to continue');

    await button(page, t('title.saves')).click();
    await button(page.locator('[data-slot="manual-1"]'), t('common.load')).click();
    await page.getByText(t('saves.error.too_old')).waitFor();
    await context.close();
  });
});
