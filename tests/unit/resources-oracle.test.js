// The real game against an independent model of its rules (tests/helpers/resourceOracle.js): both play the same
// months, with straits opening and closing, reserves bought and sold, taxes and budgets changed, and
// every price, stock, shortage step and treasury must agree. This is what proves the arithmetic of resources
// and the market; the other tests prove what the player is shown and told.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, seedRngState } from '../../src/core/rng.js';
import { createGame } from '../../src/game.js';
import { loadTestData } from '../helpers/data.js';
import { createOracle } from '../helpers/resourceOracle.js';

const data = await loadTestData();
const RESOURCES = data.activeResources.map((r) => r.id);
const STRAITS = Object.keys(data.chokepoints.byId);

/** Both play one month: the game ends its turn and the model steps. */
function playMonth(game, oracle) {
  assert.deepEqual(game.endTurn(), { ok: true });
  oracle.month();
}

/** The same random player action in the game and in the model; returns how many commands were refused. */
function act(game, oracle, dice, player) {
  const start = data.countries.byId[player].start;
  const kind = dice.pick(['buy', 'sell', 'buy', 'sell', 'tax', 'budget']);
  if (kind === 'buy' || kind === 'sell') {
    const resource = dice.pick(RESOURCES);
    const room = data.resources.byId[resource].storageMonths * Math.max(start.resources.production[resource], start.resources.consumption[resource]);
    const units = dice.chance(0.1) ? dice.pick([0, -1, NaN, 1e9]) : Math.round(dice.next() * room * 0.4 * 100) / 100 + 0.01; // some of them nonsense
    const result = game.dispatch({ type: kind === 'buy' ? 'BUY_RESOURCE' : 'SELL_RESOURCE', countryId: player, resource, units });
    const expected = oracle.trade(kind, player, resource, units);
    assert.equal(result.ok ? null : result.error.code, expected, `${kind} ${units} of ${resource}`);
    return result.ok ? 0 : 1;
  }
  if (kind === 'tax') {
    const rate = Math.round((start.economy.taxRate + (dice.next() - 0.5) * 0.2) / 0.005) * 0.005;
    if (game.dispatch({ type: 'SET_TAX', countryId: player, rate }).ok) oracle.state.c[player].tax = Math.round(rate * 10000) / 10000 + 0;
  } else {
    const category = dice.pick(['military', 'research', 'welfare', 'infrastructure']);
    const share = Math.max(0, Math.round((start.budget[category] + (dice.next() - 0.4) * 0.08) / 0.0025) * 0.0025);
    if (game.dispatch({ type: 'SET_BUDGET', countryId: player, category, share }).ok) oracle.state.c[player].budget[category] = Math.round(share * 10000) / 10000 + 0;
  }
  return 0;
}

describe('the game against an independent model of its rules', () => {
  it('agree month by month through random closures, trades and changes of budget, whoever the player is', () => {
    let refused = 0;
    let shortMonths = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const dice = createRng(seedRngState(`oracle-${seed}`));
      const player = dice.pick(Object.keys(data.countries.byId));
      const game = createGame({ data, seed, playerId: player, checkInvariants: true });
      const oracle = createOracle(data, game);
      assert.deepEqual(oracle.differences(game), [], `seed ${seed} at the start`);
      for (let month = 1; month <= 36; month++) {
        if (dice.chance(0.3)) {
          for (const id of STRAITS) {
            const blockade = dice.pick([0, 0, 0.5, 1, 1]);
            game.dispatch({ type: 'TEST_SET_BLOCKADE', chokepoint: id, blockade });
            oracle.state.block[id] = blockade;
          }
        }
        for (let i = dice.int(0, 3); i > 0; i--) refused += act(game, oracle, dice, player);
        playMonth(game, oracle);
        assert.deepEqual(oracle.differences(game).slice(0, 5), [], `seed ${seed} (${player}), month ${month}`);
        for (const country of Object.values(game.state.countries)) for (const resource of RESOURCES) if (country.resources[resource].step > 0) shortMonths++;
      }
    }
    assert.ok(refused > 20, `commands were refused too (${refused}), and for the same reasons`);
    assert.ok(shortMonths > 100, `the shortage ladders were really used (${shortMonths} country-months)`);
  });

  it('agree through a long closure of every strait: the ladders, the stores running out and the price limits', () => {
    for (const player of ['KWT', 'JOR', 'SAU']) {
      const game = createGame({ data, seed: 11, playerId: player, checkInvariants: true });
      const oracle = createOracle(data, game);
      for (const id of STRAITS) {
        game.dispatch({ type: 'TEST_SET_BLOCKADE', chokepoint: id, blockade: 1 });
        oracle.state.block[id] = 1;
      }
      for (let month = 1; month <= 40; month++) {
        playMonth(game, oracle);
        assert.deepEqual(oracle.differences(game).slice(0, 5), [], `${player}, month ${month}`);
      }
    }
  });

  it('is the test that would notice: a changed rule makes the two disagree', () => {
    const game = createGame({ data, seed: 3, playerId: 'KWT', checkInvariants: true });
    const oracle = createOracle(data, game);
    oracle.state.price.oil *= 1.01; // the model believes oil costs one percent more
    playMonth(game, oracle);
    assert.ok(oracle.differences(game).length > 0);
  });
});
