// The test lab (G-42), what a save does in the middle of a crisis, and what a shortage says it does.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findProblems } from '../../src/core/invariants.js';
import { createSaveManager } from '../../src/core/save.js';
import { checkStateShape } from '../../src/core/state.js';
import { createMemoryStorage } from '../../src/core/storage/memory.js';
import { isStatActive } from '../../src/core/stats.js';
import { createGame } from '../../src/game.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();
const newGame = (playerId = 'TUR', seed = 1) => createGame({ data, seed, playerId, checkInvariants: true });
const endTurns = (game, n) => {
  for (let i = 0; i < n; i++) assert.deepEqual(game.endTurn(), { ok: true });
  return game;
};

describe('the test lab (TEST_SET_BLOCKADE)', () => {
  const set = (game, chokepoint, blockade) => game.dispatch({ type: 'TEST_SET_BLOCKADE', chokepoint, blockade });

  it('closes and opens a strait, like any command: logged, announced, and the game is marked as played with the lab', () => {
    const game = newGame('KWT');
    const seen = [];
    game.bus.on('command', (command) => seen.push(command.type));
    assert.equal(game.state.world.flags.testLab, undefined);
    assert.deepEqual(set(game, 'hormuz', 1), { ok: true });
    assert.equal(game.state.world.chokepoints.hormuz.blockade, 1);
    assert.equal(game.state.world.flags.testLab, true);
    assert.deepEqual(seen, ['TEST_SET_BLOCKADE']);
    assert.equal(game.state.log.at(-1).type, 'TEST_SET_BLOCKADE');
    assert.deepEqual(set(game, 'hormuz', 0), { ok: true });
    assert.equal(game.state.world.chokepoints.hormuz.blockade, 0);
    assert.deepEqual(findProblems(game.state), []);
    assert.deepEqual(checkStateShape(game.state), []);
  });

  it('refuses a strait that is not there and a blockade out of range, and changes nothing', () => {
    const game = newGame('KWT');
    const before = JSON.stringify(game.state);
    const reason = (result) => (result.ok ? 'ok' : result.error.code);
    assert.equal(reason(set(game, 'panama', 1)), 'unknown_chokepoint');
    assert.equal(reason(set(game, '__proto__', 1)), 'unknown_chokepoint');
    assert.equal(reason(set(game, undefined, 1)), 'unknown_chokepoint');
    assert.equal(reason(set(game, 'hormuz', 1.5)), 'bad_value');
    assert.equal(reason(set(game, 'hormuz', -0.1)), 'bad_value');
    assert.equal(reason(set(game, 'hormuz', NaN)), 'bad_value');
    assert.equal(reason(set(game, 'hormuz', '1')), 'bad_value');
    assert.equal(JSON.stringify(game.state), before);
  });

  it('does what a war will do: a game that closes Hormuz plays the same as one that was set up that way', () => {
    const lab = newGame('KWT', 6);
    set(lab, 'hormuz', 1);
    const direct = newGame('KWT', 6);
    direct.state.world.chokepoints.hormuz.blockade = 1;
    endTurns(lab, 12);
    endTurns(direct, 12);
    assert.deepEqual(lab.state.countries, direct.state.countries);
    assert.deepEqual(lab.state.world.market, direct.state.world.market);
  });
});

describe('saving in the middle of a crisis', () => {
  it('changes nothing about what comes after: a game saved with a strait closed, loaded and played on, is the game that was never saved', async () => {
    const script = {
      3: (game) => game.dispatch({ type: 'BUY_RESOURCE', countryId: 'JOR', resource: 'oil', units: 0.5 }),
      5: (game) => {
        game.state.world.chokepoints.suez.blockade = 1;
        game.state.world.chokepoints.bab_el_mandeb.blockade = 0.5;
      },
      8: (game) => game.dispatch({ type: 'SELL_RESOURCE', countryId: 'JOR', resource: 'steel', units: 0.3 }),
      14: (game) => (game.state.world.chokepoints.suez.blockade = 0),
    };
    const play = (game, from, to) => {
      for (let month = from; month <= to; month++) {
        script[month]?.(game);
        assert.deepEqual(game.endTurn(), { ok: true });
      }
    };
    const straight = newGame('JOR', 5);
    play(straight, 1, 30);

    const saves = createSaveManager({ storage: createMemoryStorage(), dataVersion: data.version });
    for (const via of ['a slot', 'an exported file']) {
      const before = newGame('JOR', 5);
      play(before, 1, 12); // the strait is closed now, a stock is draining, a trade has been made
      assert.equal(before.state.world.chokepoints.suez.blockade, 1);
      await saves.save('manual-1', before.state);
      let state;
      if (via === 'a slot') state = (await saves.load('manual-1')).state;
      else {
        const file = await saves.exportSlot('manual-1');
        await saves.importBytes(file.bytes, 'manual-2');
        state = (await saves.load('manual-2')).state;
      }
      const after = createGame({ data, state, checkInvariants: true });
      play(after, 13, 30);
      assert.equal(JSON.stringify(after.state), JSON.stringify(straight.state), via);
    }
  });
});

describe('what a shortage says it does', () => {
  it('knows which stats a system reads today: only economic growth, so far', () => {
    assert.equal(isStatActive('country.economy.growth'), true);
    for (const stat of ['country.approval.people', 'country.unrest', 'country.industry.output', 'country.research.speed', 'country.mechanized.mobility', 'country.air.sorties']) assert.equal(isStatActive(stat), false, stat);
    assert.equal(isStatActive('country.nothing'), false);
    assert.equal(isStatActive(undefined), false);
  });

  it('only ever lists effects on stats that exist, and the ones that act are the ones the economy reads', () => {
    const named = new Set(data.activeResources.flatMap((resource) => resource.shortage.flatMap((step) => step.effects.map((effect) => effect.stat))));
    const active = [...named].filter(isStatActive);
    assert.deepEqual(active, ['country.economy.growth']);
  });
});
