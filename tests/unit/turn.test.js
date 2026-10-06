import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setClockScale } from '../../src/core/clock.js';
import { NEWS_LIMIT, createTurnRunner } from '../../src/core/turn.js';
import { createGame } from '../../src/game.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();

/** @param {any[]} systems */
function makeGame(systems) {
  return createGame({ data, seed: 1, systems, checkInvariants: true });
}

/** @param {string} id @param {number} order @param {any} [cadence] @param {(ctx: any) => void} [step] */
function system(id, order, cadence = 'any', step = () => {}) {
  return { id, order, cadence, step };
}

describe('turn runner', () => {
  it('runs systems in order, then advances the clock', () => {
    const calls = [];
    const record = (id) => () => calls.push(id);
    const game = makeGame([system('c', 30, 'any', record('c')), system('a', 10, 'any', record('a')), system('b', 20, 'any', record('b'))]);
    assert.deepEqual(game.endTurn(), { ok: true });
    assert.deepEqual(calls, ['a', 'b', 'c']);
    assert.deepEqual([game.state.clock.month, game.state.clock.turn], [2, 1]);
  });

  it('runs monthly and any systems each month, but never weekly ones', () => {
    const calls = [];
    const game = makeGame([
      system('m', 1, 'monthly', () => calls.push('m')),
      system('w', 2, 'weekly', () => calls.push('w')),
      system('a', 3, 'any', () => calls.push('a')),
    ]);
    game.endTurn();
    assert.deepEqual(calls, ['m', 'a']);
  });

  it('in week scale runs weekly systems every turn and monthly ones every fourth', () => {
    const calls = [];
    const game = makeGame([
      system('m', 1, 'monthly', () => calls.push('m')),
      system('w', 2, 'weekly', () => calls.push('w')),
    ]);
    setClockScale(game.state.clock, 'week');
    for (let i = 0; i < 4; i++) game.endTurn();
    assert.deepEqual(calls, ['w', 'w', 'w', 'm', 'w']);
  });

  it('emits turn:end with the new turn number', () => {
    const game = makeGame([]);
    const events = [];
    game.bus.on('turn:end', (e) => events.push(e));
    game.endTurn();
    assert.deepEqual(events, [{ turn: 1, monthCompleted: true }]);
  });

  it('refuses to end the turn while a blocking decision is pending', () => {
    const game = makeGame([]);
    game.state.decisions.push({ id: 'd1', blocking: true });
    const result = game.endTurn();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'decisions_pending');
    assert.equal(game.state.clock.turn, 0);

    game.state.decisions[0].blocking = false;
    assert.equal(game.endTurn().ok, true);
  });

  it('rolls back state and RNG when a system throws, and keeps the same state object', () => {
    let explode = true;
    const game = makeGame([
      system('mutate', 1, 'any', (ctx) => {
        ctx.state.countries.TUR.economy.treasuryMn = 1;
        ctx.state.world.flags.touched = true;
        ctx.rng.next();
        ctx.rng.next();
        if (explode) throw new Error('boom');
      }),
    ]);
    const stateRef = game.state;
    const before = JSON.stringify(game.state);
    const failures = [];
    game.bus.on('turn:failed', (e) => failures.push(e));

    const result = game.endTurn();

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'turn_failed');
    assert.equal(result.error.system, 'mutate');
    assert.match(result.error.message, /boom/);
    assert.equal(failures.length, 1);
    assert.equal(game.state, stateRef, 'the state object keeps its identity');
    assert.equal(JSON.stringify(game.state), before, 'everything is back to the start of the turn');

    // the RNG was rebuilt on the restored state: it behaves like a fresh game's
    const fresh = makeGame([]);
    assert.equal(game.rng.next(), fresh.rng.next());

    explode = false;
    assert.equal(game.endTurn().ok, true, 'the next turn works');
  });

  it('turns a broken invariant into a rolled-back failure', () => {
    const game = makeGame([system('bad', 1, 'any', (ctx) => void (ctx.state.world.tension = NaN))]);
    const before = game.state.world.tension;
    const result = game.endTurn();
    assert.equal(result.ok, false);
    assert.match(result.error.message, /invariant failed after bad.*tension/);
    assert.equal(game.state.world.tension, before);
  });

  it('rejects duplicate system ids', () => {
    assert.throws(() => createTurnRunner({ systems: [system('a', 1), system('a', 2)] }), /Duplicate system id "a"/);
  });

  it('records news with the date the turn leads to, and keeps only the newest', () => {
    const game = makeGame([
      system('spam', 1, 'any', (ctx) => {
        for (let i = 0; i < NEWS_LIMIT + 100; i++) ctx.news({ importance: 1, template: 'news.test', params: { n: i } });
      }),
    ]);
    game.endTurn();
    assert.equal(game.state.news.length, NEWS_LIMIT);
    const last = game.state.news.at(-1);
    assert.deepEqual(
      { turn: last.turn, year: last.year, month: last.month, n: last.params.n },
      { turn: 1, year: 2026, month: 2, n: NEWS_LIMIT + 99 },
    );
  });
});
