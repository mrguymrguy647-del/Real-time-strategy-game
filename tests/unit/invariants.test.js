import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertClean, findProblems } from '../../src/core/invariants.js';

describe('invariants', () => {
  it('accepts plain JSON, including null-prototype objects', () => {
    const bare = Object.create(null);
    bare.x = 1;
    assert.deepEqual(findProblems({ a: 1, b: [1, 2, { c: 'x', d: null, e: true }], f: bare }), []);
  });

  it('reports negative zero, which a save file would turn into 0', () => {
    const problems = findProblems({ a: { balance: -0 }, b: 0 });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /\$\.a\.balance.*negative zero/);
  });

  it('reports non-finite numbers with their path', () => {
    const problems = findProblems({ economy: { gdp: NaN }, list: [1, Infinity] });
    assert.equal(problems.length, 2);
    assert.ok(problems.some((p) => p.includes('$.economy.gdp')));
    assert.ok(problems.some((p) => p.includes('$.list[1]')));
  });

  it('reports undefined, functions, symbols and bigints', () => {
    const problems = findProblems({ a: undefined, b: () => 1, c: Symbol('s'), d: 10n });
    assert.equal(problems.length, 4);
  });

  it('reports Map, Set, Date and class instances', () => {
    class Thing {}
    const problems = findProblems({ m: new Map(), s: new Set(), d: new Date(0), t: new Thing() });
    assert.equal(problems.length, 4);
    assert.ok(problems.every((p) => p.includes('non-plain object')));
  });

  it('reports shared and circular references', () => {
    const shared = { x: 1 };
    assert.equal(findProblems({ a: shared, b: shared }).length, 1);
    const loop = { name: 'loop' };
    loop.self = loop;
    assert.equal(findProblems(loop).length, 1);
  });

  it('stops at the limit', () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, NaN]));
    assert.equal(findProblems(many, { limit: 3 }).length, 3);
  });

  it('assertClean() throws a readable error and stays quiet on clean state', () => {
    assertClean({ ok: 1 }, 'x');
    assert.throws(() => assertClean({ bad: NaN }, 'economy'), /after economy.*\$\.bad/);
  });
});
