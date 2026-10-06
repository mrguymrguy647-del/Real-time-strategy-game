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

const newGame = (seed, playerId = 'TUR') => createGame({ data, seed, playerId, checkInvariants: true });

describe('headless game', () => {
  it('starts in January 2026 on turn 0, with the 16 countries and the player picked', () => {
    const { state } = newGame(1);
    assert.deepEqual(state.clock, { year: 2026, month: 1, week: 1, turn: 0, scale: 'month' });
    assert.equal(state.meta.scenarioId, 'me_2026');
    assert.equal(state.meta.dataVersion, data.version);
    assert.equal(state.player.countryId, 'TUR');
    assert.equal(Object.keys(state.countries).length, 16);
  });

  it('plays a year: the calendar moves and the economy runs every month', () => {
    const game = play(newGame(1), 12);
    assert.deepEqual([game.state.clock.year, game.state.clock.month, game.state.clock.turn], [2027, 1, 12]);
    const { economy } = game.state.countries.TUR;
    assert.deepEqual(economy.last.period, { year: 2026, month: 12 });
    assert.ok(economy.gdpBn > data.countries.byId.TUR.start.economy.gdpBn, 'a growing economy');
  });

  it('is deterministic: the same seed gives the same game, another seed (and no randomness yet) may not matter', () => {
    const a = JSON.stringify(play(newGame(5), 24).state);
    const b = JSON.stringify(play(newGame(5), 24).state);
    assert.equal(a, b);
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

  it('applies a command, and the saved game keeps the order for the next turn', () => {
    const game = newGame(7);
    const before = game.state.countries.TUR.economy.taxRate;
    assert.deepEqual(game.dispatch({ type: 'SET_TAX', countryId: 'TUR', rate: before + 0.01 }), { ok: true });
    const saved = JSON.parse(JSON.stringify(game.state));
    const resumed = createGame({ data, state: saved, checkInvariants: true });
    assert.equal(resumed.state.countries.TUR.economy.taxRate, before + 0.01);
    assert.deepEqual(resumed.endTurn(), { ok: true });
  });

  it('refuses to continue from a malformed state', () => {
    assert.throws(() => createGame({ data, state: { nonsense: true } }), /Cannot continue/);
    const state = newGame(1).state;
    delete state.clock;
    assert.throws(() => createGame({ data, state }), /clock/);
    const orphan = newGame(1).state;
    orphan.player.countryId = 'ZZZ';
    assert.throws(() => createGame({ data, state: orphan }), /country is not in the game/);
  });

  it('rejects an unknown scenario and a country that cannot be played', () => {
    assert.throws(() => createGame({ data, scenarioId: 'nope' }), /Unknown scenario "nope"/);
    assert.throws(() => createGame({ data, playerId: 'USA' }), /"USA" cannot be played/);
  });

  it('runs the empty test scenario: a calendar and nothing else', () => {
    const game = createGame({ data, scenarioId: 'scaffold_test', checkInvariants: true });
    assert.deepEqual(game.state.countries, {});
    play(game, 3);
    assert.equal(game.state.clock.turn, 3);
  });
});
