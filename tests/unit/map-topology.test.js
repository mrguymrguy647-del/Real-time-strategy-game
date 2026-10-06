// The map is stored as TopoJSON, so the decoder must turn arcs back into the exact shapes, with
// shared borders walked in either direction.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arcsUsedBy, decodeArcs, featuresOf, polygonsOf, ringFromArcs } from '../../src/ui/map/topology.js';

/**
 * Two unit squares side by side, A on the left and B on the right, sharing the edge x = 1.
 * Arc 0 is the shared edge going down, arc 1 is the rest of A, arc 2 is the rest of B.
 * @returns {import('../../src/ui/map/topology.js').Topology}
 */
function twoSquares() {
  return {
    type: 'Topology',
    arcs: [
      [[1, 1], [1, 0]], // shared edge, top to bottom
      [[1, 0], [0, 0], [0, 1], [1, 1]], // around A, from the bottom of the shared edge back to its top
      [[1, 1], [2, 1], [2, 0], [1, 0]], // around B, from the top of the shared edge to its bottom
    ],
    objects: {
      regions: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', properties: { region: 'A' }, arcs: [[0, 1]] },
          { type: 'Polygon', properties: { region: 'B' }, arcs: [[~0, 2]] },
        ],
      },
    },
  };
}

describe('decodeArcs', () => {
  it('reads plain coordinates as they are', () => {
    const decoded = decodeArcs(twoSquares());
    assert.deepEqual([...decoded[0]], [1, 1, 1, 0]);
    assert.equal(decoded.length, 3);
  });

  it('undoes quantization: deltas, then scale and translate', () => {
    const topology = /** @type {any} */ ({
      type: 'Topology',
      transform: { scale: [0.5, 2], translate: [10, 100] },
      arcs: [[[2, 3], [1, -1], [4, 0]]], // absolute: (2,3) (3,2) (7,2)
      objects: {},
    });
    assert.deepEqual([...decodeArcs(topology)[0]], [11, 106, 11.5, 104, 13.5, 104]);
  });
});

describe('ringFromArcs', () => {
  it('joins arcs into a closed ring without repeating the join points', () => {
    const arcs = decodeArcs(twoSquares());
    const ring = ringFromArcs(arcs, [0, 1]);
    assert.deepEqual([...ring], [1, 1, 1, 0, 0, 0, 0, 1, 1, 1]);
    assert.deepEqual([ring[0], ring[1]], [ring[ring.length - 2], ring[ring.length - 1]], 'closed');
  });

  it('walks an arc backwards when its index is negative', () => {
    const arcs = decodeArcs(twoSquares());
    const ring = ringFromArcs(arcs, [~0, 2]);
    assert.deepEqual([...ring], [1, 0, 1, 1, 2, 1, 2, 0, 1, 0]);
  });
});

describe('polygonsOf and featuresOf', () => {
  it('keeps the exterior ring first and the holes after it', () => {
    const topology = /** @type {any} */ ({
      type: 'Topology',
      arcs: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]],
      objects: {},
    });
    const [polygon] = polygonsOf(decodeArcs(topology), { type: 'Polygon', arcs: [[0], [1]] });
    assert.equal(polygon.length, 2);
    assert.equal(polygon[0].length, 10);
    assert.equal(polygon[1].length, 10);
  });

  it('reads a MultiPolygon as several polygons', () => {
    const arcs = decodeArcs(twoSquares());
    const polygons = polygonsOf(arcs, { type: 'MultiPolygon', arcs: [[[0, 1]], [[~0, 2]]] });
    assert.equal(polygons.length, 2);
  });

  it('gives every feature its properties and polygons', () => {
    const features = featuresOf(twoSquares(), 'regions');
    assert.deepEqual(features.map((f) => f.properties.region), ['A', 'B']);
    assert.equal(features[0].polygons.length, 1);
  });

  it('says which object is missing', () => {
    assert.throws(() => featuresOf(twoSquares(), 'context'), /no object "context"/);
  });
});

describe('arcsUsedBy', () => {
  it('lists arcs in their plain form whichever way they are walked', () => {
    const topology = twoSquares();
    const [a, b] = /** @type {any[]} */ (topology.objects.regions.geometries);
    assert.deepEqual(arcsUsedBy(a).sort(), [0, 1]);
    assert.deepEqual(arcsUsedBy(b).sort(), [0, 2]);
  });
});
