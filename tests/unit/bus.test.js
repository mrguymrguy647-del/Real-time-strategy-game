import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../../src/core/bus.js';

describe('bus', () => {
  it('delivers payloads to subscribers of that type only', () => {
    const bus = createBus();
    const got = [];
    bus.on('a', (p) => got.push(['a', p]));
    bus.on('b', (p) => got.push(['b', p]));
    bus.emit('a', 1);
    bus.emit('b', 2);
    bus.emit('c', 3);
    assert.deepEqual(got, [['a', 1], ['b', 2]]);
  });

  it('unsubscribes with the returned function', () => {
    const bus = createBus();
    let count = 0;
    const off = bus.on('x', () => count++);
    bus.emit('x');
    off();
    bus.emit('x');
    assert.equal(count, 1);
  });

  it('keeps delivering when one handler throws', () => {
    const silence = mock.method(console, 'error', () => {});
    try {
      const bus = createBus();
      const got = [];
      bus.on('x', () => {
        throw new Error('boom');
      });
      bus.on('x', () => got.push('second'));
      bus.emit('x');
      assert.deepEqual(got, ['second']);
      assert.equal(silence.mock.callCount(), 1);
    } finally {
      silence.mock.restore();
    }
  });

  it('allows a handler to unsubscribe itself while being called', () => {
    const bus = createBus();
    let calls = 0;
    const off = bus.on('x', () => {
      calls++;
      off();
    });
    bus.emit('x');
    bus.emit('x');
    assert.equal(calls, 1);
  });

  it('clear() removes everything', () => {
    const bus = createBus();
    let count = 0;
    bus.on('x', () => count++);
    bus.clear();
    bus.emit('x');
    assert.equal(count, 0);
  });
});
