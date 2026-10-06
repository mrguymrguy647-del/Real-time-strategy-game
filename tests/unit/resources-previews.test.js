// What-if previews (G-41): what a region is worth, and what closing a strait would do.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { previewEconomy } from '../../src/systems/economy.js';
import { captureEstimate, closureEstimate } from '../../src/systems/resourcePreview.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();
const newGame = (playerId = 'TUR', seed = 1) => createGame({ data, seed, playerId, checkInvariants: true });
const endTurns = (game, n) => {
  for (let i = 0; i < n; i++) assert.deepEqual(game.endTurn(), { ok: true });
  return game;
};
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} is not close to ${b}`);

describe('what a region is worth (the capture estimate)', () => {
  it('adds the region\'s share of its country\'s output and the people it must feed, and the tax base', () => {
    const game = newGame('TUR');
    const estimate = captureEstimate(game.state, data, 'TUR', 'IRQ-basra');
    const iraq = data.countries.byId.IRQ.start.resources;
    const basra = data.regions.byId['IRQ-basra'];
    const oil = estimate.resources.find((r) => r.id === 'oil');
    close(oil.production, basra.output.oil * iraq.production.oil);
    close(oil.consumption, basra.popShare * iraq.consumption.oil);
    close(oil.net, oil.production - oil.consumption);
    assert.ok(oil.coverMonthsAfter > oil.coverMonthsBefore, 'Basra\'s oil ends Türkiye\'s oil deficit');
    assert.equal(oil.coverMonthsAfter, Infinity);
    assert.ok(estimate.resourceMn > 0 && estimate.taxMn > 0);
    close(estimate.incomeMn, estimate.taxMn + estimate.resourceMn);
    close(estimate.incomeShare, estimate.incomeMn / previewEconomy(game.state, data, 'TUR').revenue.value);
    const food = estimate.resources.find((r) => r.id === 'food');
    assert.ok(food.consumption > 0, 'a region\'s people come with it');
  });

  it('is worth more the bigger the prize: Saudi Arabia\'s oil province beats a small Iraqi one', () => {
    const game = newGame('TUR');
    const big = captureEstimate(game.state, data, 'TUR', 'SAU-eastern');
    const small = captureEstimate(game.state, data, 'TUR', 'IRQ-kurdistan');
    assert.ok(big.incomeMn > small.incomeMn * 3);
  });

  it('knows nothing of a region you hold, or one that is not in the game, and changes nothing', () => {
    const game = newGame('TUR');
    const before = JSON.stringify(game.state);
    assert.equal(captureEstimate(game.state, data, 'TUR', 'TUR-marmara'), null);
    assert.equal(captureEstimate(game.state, data, 'TUR', 'Atlantis'), null);
    assert.equal(captureEstimate(game.state, data, 'ZZZ', 'IRQ-basra'), null);
    captureEstimate(game.state, data, 'TUR', 'IRQ-basra');
    assert.equal(JSON.stringify(game.state), before);
  });

  it('follows the prices: dearer oil makes an oil region worth more', () => {
    const game = newGame('TUR');
    const oilIncome = () => captureEstimate(game.state, data, 'TUR', 'IRQ-basra').resources.find((r) => r.id === 'oil').incomeMn;
    const before = oilIncome();
    game.state.world.market.oil.price *= 1.5;
    close(oilIncome(), before * 1.5, 1e-9);
  });
});

describe('what closing a strait would do (the closure estimate)', () => {
  it('shows the price rise, and which of your stocks would run out, without touching the game', () => {
    const game = newGame('KWT');
    const before = JSON.stringify(game.state);
    const estimate = closureEstimate(game.state, data, 'KWT', 'hormuz', { months: 12 });
    assert.equal(JSON.stringify(game.state), before, 'nothing changed');
    assert.equal(estimate.blocked, 1);
    const byId = Object.fromEntries(estimate.resources.map((r) => [r.id, r]));
    assert.ok(byId.oil.priceChange > 0.2, `oil would cost ${byId.oil.priceChange} more`);
    assert.equal(byId.food.step, 3, 'Kuwait\'s food would run out within the year');
    assert.equal(byId.food.label, 'Famine');
    assert.equal(byId.food.stepIfOpen, 0);
    assert.equal(byId.food.firstShort, 7, 'six months of stock, then the shortage begins in the seventh');
    assert.equal(byId.oil.step, 0, 'its own oil stays at home');
    assert.equal(byId.oil.firstShort, null);
    assert.ok(byId.oil.incomeChangeMn < -3_000, 'and its oil income stops');
    assert.equal(byId.food.incomeChangeMn, 0);
  });

  it('says nothing is wrong for a country that does not trade through that strait', () => {
    const game = newGame('JOR');
    const estimate = closureEstimate(game.state, data, 'JOR', 'hormuz', { months: 6 });
    assert.equal(estimate.blocked, 0);
    assert.ok(estimate.resources.every((r) => r.step === 0));
    assert.ok(estimate.resources.find((r) => r.id === 'oil').priceChange > 0, 'but it pays the higher price');
  });

  it('is deterministic and does not use up the game\'s random numbers', () => {
    const game = newGame('KWT');
    const a = closureEstimate(game.state, data, 'KWT', 'hormuz');
    const rngBefore = [...game.state.rng.s];
    const b = closureEstimate(game.state, data, 'KWT', 'hormuz');
    assert.deepEqual(a, b);
    assert.deepEqual(game.state.rng.s, rngBefore);
  });

  it('does what the real thing then does: the same answer as closing the strait and playing the months', () => {
    const game = newGame('KWT', 9);
    const estimate = closureEstimate(game.state, data, 'KWT', 'hormuz', { months: 4 });
    const real = newGame('KWT', 9);
    real.state.world.chokepoints.hormuz.blockade = 1;
    endTurns(real, 4);
    const baseline = endTurns(newGame('KWT', 9), 4);
    for (const line of estimate.resources) {
      close(line.priceChange, real.state.world.market[line.id].price / baseline.state.world.market[line.id].price - 1, 1e-12);
      close(line.stockAfter, real.state.countries.KWT.resources[line.id].stock, 1e-12);
    }
  });
});
