import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_LIMIT, createCommands } from '../../src/core/commands.js';
import { createBus } from '../../src/core/bus.js';

/** A minimal context: just what dispatch reads. */
function context() {
  return { state: { clock: { turn: 3 }, log: [], value: 0 }, data: /** @type {any} */ ({}), bus: createBus() };
}

const commands = createCommands({
  SET: {
    validate: (_ctx, command) => (Number.isInteger(command.value) ? null : 'bad_value'),
    apply: ({ state }, command) => void (state.value = command.value),
  },
});

describe('commands', () => {
  it('applies a valid command and logs it with the turn', () => {
    const ctx = context();
    assert.deepEqual(commands.dispatch(ctx, { type: 'SET', value: 5 }), { ok: true });
    assert.equal(ctx.state.value, 5);
    assert.deepEqual(ctx.state.log, [{ type: 'SET', value: 5, turn: 3 }]);
  });

  it('refuses a command that fails validation and changes nothing', () => {
    const ctx = context();
    const result = commands.dispatch(ctx, { type: 'SET', value: 'five' });
    assert.deepEqual(result, { ok: false, error: { code: 'bad_value', message: 'SET refused: bad_value' } });
    assert.equal(ctx.state.value, 0);
    assert.deepEqual(ctx.state.log, []);
  });

  it('refuses unknown or malformed commands', () => {
    const ctx = context();
    for (const bad of [{ type: 'NOPE' }, { type: 'toString' }, {}, null, undefined, 'SET']) {
      const result = commands.dispatch(ctx, /** @type {any} */ (bad));
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'unknown_command');
    }
    assert.equal(commands.has('SET'), true);
    assert.equal(commands.has('toString'), false);
  });

  it('announces an applied command on the bus, and only then', () => {
    const ctx = context();
    const seen = [];
    ctx.bus.on('command', (command) => seen.push(command.type));
    commands.dispatch(ctx, { type: 'SET', value: 1 });
    commands.dispatch(ctx, { type: 'SET', value: 'x' });
    assert.deepEqual(seen, ['SET']);
  });

  it('keeps the log to the newest entries', () => {
    const ctx = context();
    for (let i = 0; i < LOG_LIMIT + 25; i++) commands.dispatch(ctx, { type: 'SET', value: i });
    assert.equal(ctx.state.log.length, LOG_LIMIT);
    assert.equal(ctx.state.log.at(-1).value, LOG_LIMIT + 24);
    assert.equal(ctx.state.log[0].value, 25);
  });

  it('does not let a command overwrite the turn recorded in the log', () => {
    const ctx = context();
    commands.dispatch(ctx, { type: 'SET', value: 1, turn: 999 });
    assert.equal(ctx.state.log[0].turn, 3);
  });
});
