// Hit-testing, graph coloring and label placement: the pure helpers the map is built from.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHitIndex, distanceToRing, pointInPolygon, pointInRing } from '../../src/ui/map/hit.js';
import { COUNTRY_PALETTE, colorGraph } from '../../src/ui/map/coloring.js';
import { poleOfInaccessibility, signedDistance } from '../../src/ui/map/labels.js';

const square = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => new Float64Array([x, y, x + s, y, x + s, y + s, x, y + s, x, y]);
/** An L: the square 0..100 with its top-right quarter cut away. */
const ell = new Float64Array([0, 0, 100, 0, 100, 40, 40, 40, 40, 100, 0, 100, 0, 0]);

describe('point in polygon', () => {
  it('tells inside from outside', () => {
    assert.equal(pointInRing(square(0, 0, 10), 5, 5), true);
    assert.equal(pointInRing(square(0, 0, 10), 15, 5), false);
    assert.equal(pointInRing(ell, 20, 80), true);
    assert.equal(pointInRing(ell, 80, 80), false, 'the cut-away corner');
  });

  it('treats a hole as outside', () => {
    const polygon = [square(0, 0, 100), square(40, 40, 20)];
    assert.equal(pointInPolygon(polygon, 10, 10), true);
    assert.equal(pointInPolygon(polygon, 50, 50), false);
  });

  it('measures the distance to the nearest edge', () => {
    assert.equal(distanceToRing(square(0, 0, 10), 5, 3), 3);
    assert.equal(distanceToRing(square(0, 0, 10), 14, 5), 4);
    assert.ok(Math.abs(distanceToRing(square(0, 0, 10), 13, 14) - 5) < 1e-9, 'to a corner');
  });
});

describe('hit index', () => {
  const index = createHitIndex([
    { id: 'big', polygons: [[square(0, 0, 400)]] },
    { id: 'islet', polygons: [[square(500, 500, 6)]] },
    { id: 'donut', polygons: [[square(1000, 0, 300), square(1100, 100, 100)]] },
    { id: 'islands', polygons: [[square(2000, 0, 50)], [square(2200, 0, 50)]] },
  ]);

  it('finds the feature that contains the point', () => {
    assert.deepEqual(index.hit(200, 200), { id: 'big', inside: true, distance: 0 });
    assert.equal(index.hit(2225, 25)?.id, 'islands', 'any of its polygons');
  });

  it('returns nothing over empty sea and inside a hole', () => {
    assert.equal(index.hit(700, 700), null);
    assert.equal(index.hit(1150, 150), null);
  });

  it('with slop, picks the nearest feature within reach, so a tiny region can still be tapped', () => {
    assert.equal(index.hit(512, 503), null, 'no slop, no hit');
    const near = index.hit(512, 503, 10);
    assert.equal(near?.id, 'islet');
    assert.equal(near?.inside, false);
    assert.equal(near?.distance, 6);
    assert.equal(index.hit(530, 503, 10), null, 'too far');
  });

  it('prefers the closer of two features', () => {
    const two = createHitIndex([
      { id: 'a', polygons: [[square(0, 0, 10)]] },
      { id: 'b', polygons: [[square(30, 0, 10)]] },
    ]);
    assert.equal(two.hit(24, 5, 30)?.id, 'b');
    assert.equal(two.hit(16, 5, 30)?.id, 'a');
  });
});

describe('coloring', () => {
  /** @param {Array<[string, string]>} edges */
  const graph = (edges) => {
    /** @type {Map<string, Set<string>>} */
    const g = new Map();
    for (const [a, b] of edges) {
      if (!g.has(a)) g.set(a, new Set());
      if (!g.has(b)) g.set(b, new Set());
      g.get(a)?.add(b);
      g.get(b)?.add(a);
    }
    return g;
  };

  it('gives neighbours different colors', () => {
    const g = graph([['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd'], ['d', 'e'], ['e', 'c']]);
    const colors = colorGraph([...g.keys()], g);
    for (const [a, set] of g) for (const b of set) assert.notEqual(colors.get(a), colors.get(b), `${a} and ${b}`);
  });

  it('is deterministic', () => {
    const g = graph([['x', 'y'], ['y', 'z'], ['z', 'x']]);
    assert.deepEqual([...colorGraph(['z', 'y', 'x'], g)], [...colorGraph(['x', 'y', 'z'], g)]);
  });

  it('uses few colors', () => {
    const g = graph([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]);
    assert.ok(Math.max(...colorGraph([...g.keys()], g).values()) <= 1);
  });

  it('never runs out: with too few colors it reuses one instead of failing', () => {
    const g = graph([['a', 'b'], ['b', 'c'], ['c', 'a']]);
    const colors = colorGraph(['a', 'b', 'c'], g, 2);
    assert.equal(colors.size, 3);
    assert.ok([...colors.values()].every((c) => c === 0 || c === 1));
  });

  it('has a palette of distinct colors', () => {
    assert.equal(new Set(COUNTRY_PALETTE).size, COUNTRY_PALETTE.length);
    for (const color of COUNTRY_PALETTE) assert.match(color, /^#[0-9a-f]{6}$/);
  });
});

describe('pole of inaccessibility', () => {
  it('is the middle of a square', () => {
    const [x, y, d] = poleOfInaccessibility([square(0, 0, 100)], 0.01);
    assert.ok(Math.abs(x - 50) < 1 && Math.abs(y - 50) < 1);
    assert.ok(Math.abs(d - 50) < 1);
  });

  it('stays inside an L-shape, in the thick part', () => {
    const polygon = [ell];
    const [x, y, d] = poleOfInaccessibility(polygon, 0.01);
    assert.ok(signedDistance(polygon, x, y) > 0);
    assert.ok(d > 19, `the L is 40 wide, so the best point is about 20 from the edge (got ${d})`);
  });

  it('keeps out of a hole', () => {
    const polygon = [square(0, 0, 100), square(30, 30, 40)];
    const [x, y] = poleOfInaccessibility(polygon, 0.01);
    assert.equal(pointInPolygon(polygon, x, y), true);
  });

  it('survives a degenerate shape', () => {
    assert.deepEqual(poleOfInaccessibility([new Float64Array([1, 1, 5, 1, 1, 1])]), [1, 1, 0]);
  });
});
