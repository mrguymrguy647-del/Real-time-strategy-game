// Reserves (G-40): buying and selling by command, and why a price is what it is.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findProblems } from '../../src/core/invariants.js';
import { createGame } from '../../src/game.js';
import { planTrade } from '../../src/systems/resourceCommands.js';
import { countryFlows } from '../../src/systems/resourceFlows.js';
import { priceExplained } from '../../src/systems/resources.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();
const newGame = (playerId = 'TUR', seed = 1) => createGame({ data, seed, playerId, checkInvariants: true });
const endTurns = (game, n) => {
  for (let i = 0; i < n; i++) assert.deepEqual(game.endTurn(), { ok: true });
  return game;
};
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} is not close to ${b}`);
const RESOURCES = ['oil', 'food', 'steel', 'rare'];

describe('reserves: buying and selling', () => {
  const buy = (game, units, resource = 'oil', countryId = 'TUR') => game.dispatch({ type: 'BUY_RESOURCE', countryId, resource, units });
  const sell = (game, units, resource = 'oil', countryId = 'TUR') => game.dispatch({ type: 'SELL_RESOURCE', countryId, resource, units });

  it('buying moves money out of the treasury at the price plus the spread and units into the stock', () => {
    const game = newGame();
    const { economy, resources } = game.state.countries.TUR;
    const [treasury, stock, price] = [economy.treasuryMn, resources.oil.stock, game.state.world.market.oil.price];
    assert.deepEqual(buy(game, 5), { ok: true });
    close(economy.treasuryMn, treasury - 5 * price * (1 + data.balance.market.spread));
    close(resources.oil.stock, stock + 5);
    assert.equal(game.state.log.at(-1).type, 'BUY_RESOURCE');
  });

  it('selling brings the price less the spread, and buying then selling loses money', () => {
    const game = newGame();
    const { economy, resources } = game.state.countries.TUR;
    const start = economy.treasuryMn;
    assert.deepEqual(sell(game, 3), { ok: true });
    close(economy.treasuryMn, start + 3 * game.state.world.market.oil.price * (1 - data.balance.market.spread));
    close(resources.oil.stock, data.countries.byId.TUR.start.resources.stockpile.oil - 3);
    buy(game, 3);
    assert.ok(economy.treasuryMn < start, 'the round trip cost the spread twice');
    close(resources.oil.stock, data.countries.byId.TUR.start.resources.stockpile.oil);
  });

  it('announces itself on the bus, like every command', () => {
    const game = newGame();
    const seen = [];
    game.bus.on('command', (command) => seen.push(command.type));
    buy(game, 1);
    assert.deepEqual(seen, ['BUY_RESOURCE']);
  });

  it('refuses what cannot be done, with a reason, and changes nothing', () => {
    const game = newGame();
    const before = JSON.stringify(game.state);
    const reason = (result) => (result.ok ? 'ok' : result.error.code);
    assert.equal(reason(buy(game, 1, 'oil', 'ZZZ')), 'unknown_country');
    assert.equal(reason(buy(game, 1, 'oil', '__proto__')), 'unknown_country');
    assert.equal(reason(buy(game, 1, 'gold')), 'unknown_resource');
    assert.equal(reason(buy(game, 1, 'water')), 'unknown_resource', 'water is a disabled module');
    assert.equal(reason(buy(game, 0)), 'bad_value');
    assert.equal(reason(buy(game, -3)), 'bad_value');
    assert.equal(reason(buy(game, NaN)), 'bad_value');
    assert.equal(reason(buy(game, '5')), 'bad_value');
    assert.equal(reason(buy(game, 100_000)), 'storage_full');
    assert.equal(reason(sell(game, 100_000)), 'not_enough_stock');
    game.state.countries.TUR.economy.treasuryMn = 100;
    assert.equal(reason(buy(game, 5)), 'no_money');
    assert.equal(JSON.stringify({ ...game.state, log: 0, countries: 0 }), JSON.stringify({ ...JSON.parse(before), log: 0, countries: 0 }));
    assert.deepEqual(game.state.log, []);
    assert.equal(game.state.countries.TUR.resources.oil.stock, data.countries.byId.TUR.start.resources.stockpile.oil);
  });

  it('cannot reach a market that is shut: a country whose every route is blockaded cannot trade', () => {
    const game = newGame('KWT');
    game.state.world.chokepoints.hormuz.blockade = 1;
    assert.equal(buy(game, 1, 'oil', 'KWT').error.code, 'no_market_access');
    assert.equal(sell(game, 1, 'oil', 'KWT').error.code, 'no_market_access');
    game.state.world.chokepoints.hormuz.blockade = 0.5;
    assert.deepEqual(buy(game, 1, 'oil', 'KWT'), { ok: true }, 'half open is open enough');
  });

  it('cannot buy more than the stores hold, and exactly what they hold is fine', () => {
    const game = newGame();
    const flow = countryFlows(game.state, data, 'TUR').byResource.oil;
    const room = flow.capacity - game.state.countries.TUR.resources.oil.stock;
    assert.equal(buy(game, room + 1).error.code, 'storage_full');
    game.state.countries.TUR.economy.treasuryMn = 1e9;
    assert.deepEqual(buy(game, room), { ok: true });
    assert.ok(Math.abs(game.state.countries.TUR.resources.oil.stock - flow.capacity) < 1e-3);
  });

  it('lets the treasury go to exactly zero and never below, and keeps the state clean', () => {
    const game = newGame();
    const plan = planTrade(game, { countryId: 'TUR', resource: 'oil', units: 4 }, 'buy');
    game.state.countries.TUR.economy.treasuryMn = plan.valueMn;
    assert.deepEqual(buy(game, 4), { ok: true });
    assert.equal(game.state.countries.TUR.economy.treasuryMn, 0);
    assert.deepEqual(findProblems(game.state), []);
  });

  it('changes what the next month does: a bigger stock lasts longer under a closed strait', () => {
    const run = (extra) => {
      const game = newGame('JOR');
      if (extra) assert.deepEqual(buy(game, extra, 'oil', 'JOR'), { ok: true });
      game.state.world.chokepoints.bab_el_mandeb.blockade = 1;
      game.state.world.chokepoints.suez.blockade = 1;
      endTurns(game, 6);
      return game.state.countries.JOR.resources.oil;
    };
    assert.ok(run(0).step > 0, 'a thin reserve runs out');
    assert.equal(run(1.5).step, 0, 'a unit and a half more of oil sees Jordan through');
  });
});

describe('why a price is what it is', () => {
  it('at the start: the base price, tension and nothing else', () => {
    const game = newGame();
    const { target, price } = priceExplained(game.state, data, 'oil');
    assert.deepEqual(target.parts.map((p) => p.id), ['base', 'balance', 'tension', 'shock']);
    close(price.value, game.state.world.market.oil.price);
    close(target.parts[1].value, 1);
  });

  it('after a month: the very numbers the turn used, so the explanation is the price', () => {
    const game = endTurns(newGame(), 5);
    for (const resource of RESOURCES) {
      const { target, price } = priceExplained(game.state, data, resource);
      close(price.value, game.state.world.market.oil.price * 0 + game.state.world.market[resource].price, 1e-12);
      close(target.parts[3].value, game.state.world.market[resource].shock);
    }
  });
});
