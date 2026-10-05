import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/game.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();

/** @param {any} game @param {number} turns */
function play(game, turns) {
  for (let i = 0; i < turns; i++) assert.deepEqual(game.endTurn(), { ok: true });
  return game;
}

const newGame = (seed) => createGame({ data, seed, checkInvariants: true });

describe('headless game', () => {
  it('starts at January 2026 on turn 0', () => {
    const { state } = newGame(1);
    assert.deepEqual(state.clock, { year: 2026, month: 1, week: 1, turn: 0, scale: 'month' });
    assert.equal(state.meta.scenarioId, 'scaffold_test');
    assert.equal(state.meta.dataVersion, data.version);
  });

  it('plays a year: calendar, dice rolls and news', () => {
    const game = play(newGame(1), 12);
    assert.deepEqual([game.state.clock.year, game.state.clock.month, game.state.clock.turn], [2027, 1, 12]);
    assert.equal(game.state.demo.rolls, 12);
    assert.equal(game.state.news.length, 12);
    assert.ok(game.state.demo.lastRoll >= 1 && game.state.demo.lastRoll <= 100);
  });

  it('is deterministic: the same seed gives the same game, another seed a different one', () => {
    const a = JSON.stringify(play(newGame(5), 24).state);
    const b = JSON.stringify(play(newGame(5), 24).state);
    const c = JSON.stringify(play(newGame(6), 24).state);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('keeps state free of anything but plain JSON', () => {
    const game = play(newGame(3), 12);
    assert.deepEqual(JSON.parse(JSON.stringify(game.state)), game.state);
  });

  it('save -> load -> keep playing equals playing straight through (T-07)', () => {
    const straight = play(newGame(42), 20);

    const first = play(newGame(42), 10);
    const saved = JSON.parse(JSON.stringify(first.state)); // what a save file holds
    const resumed = play(createGame({ data, state: saved, checkInvariants: true }), 10);

    assert.deepEqual(resumed.state, straight.state);
  });

  it('refuses to continue from a malformed state', () => {
    assert.throws(() => createGame({ data, state: { nonsense: true } }), /Cannot continue/);
    const state = newGame(1).state;
    delete state.clock;
    assert.throws(() => createGame({ data, state }), /clock/);
  });

  it('rejects an unknown scenario', () => {
    assert.throws(() => createGame({ data, scenarioId: 'nope' }), /Unknown scenario "nope"/);
  });
});
