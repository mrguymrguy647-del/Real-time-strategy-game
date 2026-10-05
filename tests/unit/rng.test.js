import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, normalizeSeed, seedRngState } from '../../src/core/rng.js';

describe('rng', () => {
  it('matches the golden sequence (changing the algorithm would break old saves)', () => {
    const state = seedRngState(12345);
    assert.deepEqual(state, { s: [109831331, -1797973255, 1699267478, 516375452] });
    const rng = createRng(state);
    assert.deepEqual([rng.next(), rng.next(), rng.next(), rng.next(), rng.next()], [
      0.727176858112216, 0.26155974506400526, 0.262401201762259, 0.9079904058016837, 0.013901109574362636,
    ]);
  });

  it('matches golden integer rolls for numeric and string seeds', () => {
    const roll = (seed) => {
      const rng = createRng(seedRngState(seed));
      return [1, 2, 3, 4, 5].map(() => rng.int(1, 100));
    };
    assert.deepEqual(roll(1), [23, 64, 72, 34, 63]);
    assert.deepEqual(roll('hello').slice(0, 3), [79, 91, 16]);
  });

  it('gives the same sequence for the same seed and different ones for different seeds', () => {
    const draw = (seed) => {
      const rng = createRng(seedRngState(seed));
      return Array.from({ length: 20 }, () => rng.next());
    };
    assert.deepEqual(draw(7), draw(7));
    assert.notDeepEqual(draw(7), draw(8));
  });

  it('continues exactly after its state is saved and restored through JSON', () => {
    const rng = createRng(seedRngState(99));
    for (let i = 0; i < 37; i++) rng.next();
    const restored = createRng(JSON.parse(JSON.stringify(rng.state)));
    for (let i = 0; i < 50; i++) assert.equal(restored.next(), rng.next());
  });

  it('clone() continues from the same point without affecting the original', () => {
    const rng = createRng(seedRngState(5));
    rng.next();
    const copy = rng.clone();
    const fromCopy = [copy.next(), copy.next(), copy.next()];
    assert.deepEqual([rng.next(), rng.next(), rng.next()], fromCopy);
    copy.next();
    copy.next();
    // drawing more from the clone must not have moved the original
    const original = createRng(seedRngState(5));
    original.next();
    for (let i = 0; i < 3; i++) original.next();
    assert.equal(rng.next(), original.next());
  });

  it('keeps next() inside [0, 1) and int() inside its inclusive bounds', () => {
    const rng = createRng(seedRngState(2024));
    const seen = new Set();
    for (let i = 0; i < 20_000; i++) {
      const x = rng.next();
      assert.ok(x >= 0 && x < 1);
      const n = rng.int(3, 7);
      assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
      seen.add(n);
    }
    assert.deepEqual([...seen].sort(), [3, 4, 5, 6, 7], 'both ends and everything between must occur');
    assert.equal(rng.int(5, 5), 5);
  });

  it('is roughly uniform', () => {
    const rng = createRng(seedRngState(31337));
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += rng.next();
    assert.ok(Math.abs(sum / n - 0.5) < 0.01, `mean was ${sum / n}`);
  });

  it('handles chance() at the extremes and in between', () => {
    const rng = createRng(seedRngState(1));
    for (let i = 0; i < 1000; i++) {
      assert.equal(rng.chance(0), false);
      assert.equal(rng.chance(1), true);
    }
    let hits = 0;
    for (let i = 0; i < 20_000; i++) if (rng.chance(0.25)) hits++;
    assert.ok(Math.abs(hits / 20_000 - 0.25) < 0.02);
  });

  it('picks and shuffles deterministically without losing elements', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    const rng = createRng(seedRngState(11));
    assert.ok(list.includes(rng.pick(list)));
    assert.throws(() => rng.pick([]), RangeError);

    const a = createRng(seedRngState(3)).shuffle([...list]);
    const b = createRng(seedRngState(3)).shuffle([...list]);
    assert.deepEqual(a, b);
    assert.deepEqual([...a].sort(), list);
  });

  it('accepts integer and string seeds and rejects everything else', () => {
    assert.equal(normalizeSeed(42), 42);
    assert.equal(normalizeSeed('abc'), normalizeSeed('abc'));
    assert.notEqual(normalizeSeed('abc'), normalizeSeed('abd'));
    assert.throws(() => normalizeSeed(1.5), TypeError);
    assert.throws(() => normalizeSeed(undefined), TypeError);
  });
});
