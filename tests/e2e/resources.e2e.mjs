// End-to-end tests of the resources and the world market on a phone-sized screen (Phase 1, M1.2): the
// strip under the treasury, the Resources panel and its trades, the straits on the map, a shortage that
// shows, and what a region would be worth.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { endTurn, newGame, openApp, t } from '../../tools/lib/drive.mjs';
import { button, freshPage, startEnvironment, stopEnvironment } from './helpers.mjs';

/** @type {Awaited<ReturnType<typeof startEnvironment>>} */
let env;
before(async () => {
  env = await startEnvironment();
});
after(async () => {
  await stopEnvironment(env);
});

/** The running game's state, read from the page. @param {import('playwright-core').Page} page @param {string} path */
const stateAt = (page, path) =>
  page.evaluate((p) => p.split('.').reduce((value, key) => value?.[key], /** @type {any} */ (globalThis).__app.ctx.session.game.state), path);

/** Run code against the running game's state (to set up a situation a real game will reach later). @param {import('playwright-core').Page} page @param {string} body */
const withState = (page, body) =>
  page.evaluate((code) => new Function('state', code)(/** @type {any} */ (globalThis).__app.ctx.session.game.state), body);

describe('resources in the game', () => {
  it('shows how each resource stands, opens the Resources panel, and buys and sells reserves', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');

    // the strip under the treasury: one chip per resource
    assert.equal(await page.locator('.play-hud__chips .chip-res').count(), 4);
    assert.equal(await page.locator('.play-hud__chips [data-resource="oil"]').textContent().then((s) => s.replace(/\s+/g, ' ').trim()), '🛢️ 3 mo', 'Türkiye\'s oil reserve lasts 3 months if trade stops');
    assert.ok((await page.locator('.play-hud__chips [data-resource="food"]').textContent()).includes(t('res.chip.ok')), 'it makes all its food');

    await button(page, t('play.resources')).click();
    await page.waitForSelector('.resources:not([hidden]) .res');
    assert.equal(await page.locator('.resources .res').count(), 4);
    const oilCard = page.locator('.resources [data-resource="oil"]');
    assert.ok((await oilCard.locator('[data-price]').textContent()).includes('per barrel'));
    assert.equal(await page.locator('.resources .strait').count(), 3);
    assert.equal(await page.locator('[data-resource="oil"] [data-short]').count(), 0, 'nothing is short');

    // buying one month of oil moves money out and units in, at once
    const stockBefore = await stateAt(page, 'countries.TUR.resources.oil.stock');
    const treasuryBefore = await stateAt(page, 'countries.TUR.economy.treasuryMn');
    await oilCard.locator('[data-trade="buy"]').click();
    const stockAfter = await stateAt(page, 'countries.TUR.resources.oil.stock');
    const treasuryAfter = await stateAt(page, 'countries.TUR.economy.treasuryMn');
    assert.ok(Math.abs(stockAfter - stockBefore - 3.5) < 1e-6, `a month of oil is 3.5 units (got ${stockAfter - stockBefore})`);
    assert.ok(treasuryAfter < treasuryBefore - 2000, 'and costs billions');
    assert.ok((await page.textContent('.play-hud__treasury')).includes('$'), 'the strip follows');
    assert.equal(await stateAt(page, 'log.0.type'), 'BUY_RESOURCE');

    // selling brings money back, less the spread
    await oilCard.locator('[data-trade="sell"]').click();
    assert.ok(Math.abs((await stateAt(page, 'countries.TUR.resources.oil.stock')) - stockBefore) < 1e-6);
    assert.ok((await stateAt(page, 'countries.TUR.economy.treasuryMn')) < treasuryBefore, 'the round trip cost the spread');

    // a full store cannot take more: the button says so
    for (let i = 0; i < 3; i++) await oilCard.locator('[data-trade="buy"]:not([disabled])').click();
    const full = oilCard.locator('[data-trade="buy"]');
    assert.equal(await full.isDisabled(), true);
    assert.ok((await full.textContent()).includes(t('res.trade.error.storage_full')));
    assert.deepEqual(problems, []);
    await context.close();
  });

  it('lists the report\'s resources after End turn, and opens the panel from it', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'SAU');
    await endTurn(page);
    await page.waitForSelector('.report:not([hidden])');
    assert.equal(await page.locator('.report [data-line="resources"]').count(), 1, 'Saudi Arabia earns from oil');
    assert.equal(await page.locator('.report .report__res li').count(), 4);
    assert.ok((await page.locator('.report [data-resource="oil"]').textContent()).includes(t('res.position.sells', { amount: '16.5' })));

    await page.locator('[data-line="resources"] .report__toggle').click();
    const why = await page.locator('[data-line="resources"] .why').textContent();
    assert.ok(why.includes(t('why.resources.oil')) && why.includes(t('why.total')));

    await button(page, t('report.openResources')).click();
    await page.waitForSelector('.resources:not([hidden]) .res');
    assert.equal(await page.locator('.report:not([hidden])').count(), 0, 'one panel at a time');
    await context.close();
    assert.deepEqual(problems, []);
  });

  it('keeps the price moving: after a turn each price has changed and says so', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    const before = await stateAt(page, 'world.market.oil.price');
    await endTurn(page);
    await page.waitForSelector('.report:not([hidden])');
    const after = await stateAt(page, 'world.market.oil.price');
    assert.notEqual(before, after);
    await button(page, t('play.resources')).click();
    await page.waitForSelector('.resources:not([hidden]) .res');
    assert.ok((await page.locator('.resources [data-resource="oil"] .res__change').textContent()).match(/[▲▼]/), 'the arrow shows which way the price went');
    await context.close();
  });
});

describe('the straits', () => {
  it('are markers on the map: a tap opens the Resources panel at that strait, and "What if it closed?" answers', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'KWT');
    await page.waitForFunction(() => /** @type {any} */ (globalThis).__map?.info().ready, null, { timeout: 30_000 });
    await page.evaluate(() => /** @type {any} */ (globalThis).__map.resetView()); // the whole theater, so every strait is in view
    await page.waitForSelector('[data-marker="hormuz"]:not([hidden])');
    assert.equal(await page.locator('.map__marker:not([hidden])').count(), 3);

    await page.locator('[data-marker="hormuz"]').click();
    await page.waitForSelector('.resources:not([hidden]) [data-strait="hormuz"]');
    assert.ok((await page.locator('[data-strait="hormuz"]').textContent()).includes(t('res.strait.exposure', { percent: '100%' })), 'all of Kuwait\'s sea trade passes Hormuz');

    await page.locator('[data-strait="hormuz"] .strait__toggle').click();
    const result = page.locator('[data-closure="hormuz"]');
    await result.waitFor();
    const text = await result.textContent();
    assert.ok(text.includes(t('res.closure.intro', { n: 12 })));
    assert.match(text, /Oil.*you would lose \$\d/, 'its oil income would stop');
    assert.ok(text.includes('Famine'), 'and the food would run out');
    assert.equal(await page.locator('.map__marker.is-blocked').count(), 0, 'nothing is closed');

    // the what-if changed nothing
    assert.equal(await stateAt(page, 'world.chokepoints.hormuz.blockade'), 0);
    await page.locator('[data-strait="hormuz"] .strait__toggle').click();
    assert.equal(await result.count(), 0, 'and it can be hidden');
    await context.close();
    assert.deepEqual(problems, []);
  });

  it('show a shortage when one is closed: the strip, the card and the marker all say so, and it ends when the strait opens', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'KWT');
    // Nothing can close a strait yet (wars come next), so set the situation up the way a war will.
    await withState(page, 'state.world.chokepoints.hormuz.blockade = 1;');
    for (let i = 0; i < 12; i++) await endTurn(page);
    await page.waitForSelector('.report:not([hidden])');
    assert.equal(await stateAt(page, 'countries.KWT.resources.food.step'), 3);
    const report = await page.locator('.report').textContent();
    assert.ok(report.includes('Famine'), 'the report names it');
    assert.equal(await page.locator('.report .alert[data-alert="shortage"][data-resource="food"]').count(), 1);
    assert.equal(await page.locator('.play-hud__chips [data-resource="food"].is-short').count(), 1);
    assert.equal(await page.locator('.map__marker.is-blocked').count(), 1);
    assert.ok((await page.locator('.play-hud__chips [data-resource="food"]').textContent()).includes(t('res.chip.short')));

    await button(page, t('report.openResources')).click();
    await page.waitForSelector('.resources:not([hidden])');
    const short = page.locator('[data-resource="food"] [data-short]');
    assert.ok((await short.textContent()).includes(t('res.short', { label: 'Famine' })));
    assert.ok((await short.textContent()).includes('Economic growth ×0.8'), 'its effect is spelled out');
    assert.equal(await page.locator('.resources .res.is-short').count() >= 1, true);
    // with the strait blocked, the market is shut for Kuwait: buying says why not
    assert.ok((await page.locator('[data-resource="food"] [data-trade="buy"]').textContent()).includes(t('res.trade.error.no_market_access')));
    assert.ok((await page.locator('[data-strait="hormuz"]').textContent()).includes(t('res.strait.blocked', { percent: '100%' })));

    // the strait opens again, and the shortage ends with the next month
    await withState(page, 'state.world.chokepoints.hormuz.blockade = 0;');
    await endTurn(page);
    await page.waitForSelector('.report:not([hidden])');
    assert.equal(await stateAt(page, 'countries.KWT.resources.food.step'), 0);
    assert.equal(await page.locator('.play-hud__chips .is-short').count(), 0);
    await context.close();
    assert.deepEqual(problems, []);
  });
});

describe('what a region is worth', () => {
  it('is told under a region of another country, and not under your own, nor when picking a country', async () => {
    const { context, page, problems } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await newGame(page, 0, 'TUR');
    await page.waitForFunction(() => /** @type {any} */ (globalThis).__map?.info().ready, null, { timeout: 30_000 });

    await page.evaluate(() => /** @type {any} */ (globalThis).__map.select('IRQ-basra'));
    await page.waitForSelector('.capture');
    const text = await page.locator('.capture').textContent();
    assert.ok(text.includes(t('map.capture.title')));
    assert.match(await page.locator('[data-capture="income"]').textContent(), /State income \+\$[\d.]+ (billion|million) a month \(\+\d+%\)/);
    assert.ok((await page.locator('[data-capture="oil"]').textContent()).includes('Oil: +7.64 a month'), 'Basra\'s oil would end Türkiye\'s oil deficit');
    assert.ok((await page.locator('[data-capture="oil"]').textContent()).includes(t('map.capture.noShortfall')));
    assert.ok((await page.locator('.sheet__region').textContent()).includes('Oil 62%'), 'it also says what the region makes');

    await page.evaluate(() => /** @type {any} */ (globalThis).__map.select('TUR-marmara'));
    await page.waitForSelector('.sheet__region[data-region="TUR-marmara"]');
    assert.equal(await page.locator('.capture').count(), 0, 'nothing to capture in your own country');
    await context.close();

    const picker = await freshPage(env.browser);
    await openApp(picker.page, env.site.url);
    await picker.page.getByRole('button', { name: t('title.newGame'), exact: true }).click();
    await picker.page.waitForSelector('.pick-strip .chip', { timeout: 30_000 });
    await picker.page.waitForFunction(() => /** @type {any} */ (globalThis).__map?.info().ready, null, { timeout: 30_000 });
    await picker.page.evaluate(() => /** @type {any} */ (globalThis).__map.select('IRQ-basra'));
    await picker.page.waitForSelector('.sheet__region');
    assert.equal(await picker.page.locator('.capture').count(), 0, 'you have not chosen a country yet');
    await picker.context.close();
    assert.deepEqual(problems, []);
  });

  it('shows a country\'s resource picture when choosing: what it sells, buys, keeps, and how its sea trade runs', async () => {
    const { context, page } = await freshPage(env.browser);
    await openApp(page, env.site.url);
    await button(page, t('title.newGame')).click();
    await page.waitForSelector('.pick-strip .chip', { timeout: 30_000 });
    await page.locator('.pick-strip [data-country="KWT"]').click();
    await page.waitForSelector('.sheet__resources');
    const panel = await page.locator('.sheet').textContent();
    assert.ok(panel.includes(t('map.panel.resources')));
    assert.ok((await page.locator('.sheet__resources [data-resource="oil"]').textContent()).includes(t('res.position.sells', { amount: '6.1' })));
    assert.ok((await page.locator('.sheet__resources [data-resource="food"]').textContent()).includes(t('res.position.buys', { amount: '2.75' })));
    assert.ok(panel.includes('Strait of Hormuz 100%'), 'all of Kuwait\'s sea trade passes the strait');
    assert.match(panel, /taxes 1[12]% · resources 3[34]%/, 'its income is mostly oil');
    await context.close();
  });
});
