// Rectangles of the map (world units): bounding boxes, overlap and growth, used for culling and redraw decisions.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boxContains, boxOf, boxesIntersect, expandBox, intersectBoxes, longerSide } from '../../src/ui/map/box.js';

const ring = (/** @type {number[]} */ ...xy) => Float64Array.from(xy);
const box = (/** @type {number} */ minX, /** @type {number} */ minY, /** @type {number} */ maxX, /** @type {number} */ maxY) => ({ minX, minY, maxX, maxY });

describe('boxOf', () => {
  it('bounds the exterior rings of all polygons, ignoring holes', () => {
    const polygons = [[ring(0, 0, 10, 0, 10, 5, 0, 5, 0, 0), ring(2, 2, 3, 2, 3, 3, 2, 3, 2, 2)], [ring(20, -4, 30, -4, 30, 1, 20, -4)]];
    assert.deepEqual(boxOf(polygons), box(0, -4, 30, 5));
  });
});

describe('box relations', () => {
  it('knows the longer side', () => {
    assert.equal(longerSide(box(0, 0, 10, 4)), 10);
    assert.equal(longerSide(box(0, 0, 3, 8)), 8);
  });

  it('finds overlap, touching and distance', () => {
    assert.equal(boxesIntersect(box(0, 0, 10, 10), box(5, 5, 20, 20)), true);
    assert.equal(boxesIntersect(box(0, 0, 10, 10), box(10, 10, 20, 20)), true, 'touching counts');
    assert.equal(boxesIntersect(box(0, 0, 10, 10), box(11, 0, 20, 10)), false);
  });

  it('knows when one box is inside another', () => {
    assert.equal(boxContains(box(0, 0, 100, 100), box(10, 10, 20, 20)), true);
    assert.equal(boxContains(box(0, 0, 100, 100), box(10, 10, 120, 20)), false);
    assert.equal(boxContains(box(0, 0, 100, 100), box(0, 0, 100, 100)), true);
  });

  it('grows by a share of its own size on every side', () => {
    assert.deepEqual(expandBox(box(0, 0, 100, 50), 0.1), box(-10, -5, 110, 55));
  });

  it('intersects to the shared part, or nothing', () => {
    assert.deepEqual(intersectBoxes(box(0, 0, 10, 10), box(5, -5, 20, 6)), box(5, 0, 10, 6));
    assert.equal(intersectBoxes(box(0, 0, 10, 10), box(20, 20, 30, 30)), null);
  });
});
