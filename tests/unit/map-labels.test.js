// Label placement: names that would pile up are thinned out, the most important first.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { boxesOverlap, chooseLabels, isInside } from '../../src/ui/map/labelLayout.js';

const box = (/** @type {number} */ x, /** @type {number} */ y, w = 60, h = 16) => ({ x, y, w, h });
const screen = { left: 0, top: 0, right: 1000, bottom: 1000 };

describe('boxesOverlap', () => {
  it('is true for boxes that cover each other and false for distant ones', () => {
    assert.equal(boxesOverlap(box(0, 0), box(10, 4)), true);
    assert.equal(boxesOverlap(box(0, 0), box(200, 0)), false);
    assert.equal(boxesOverlap(box(0, 0), box(0, 100)), false);
  });

  it('keeps a gap: boxes that only just do not touch still count as overlapping', () => {
    // 60 px wide boxes whose centres are 62 px apart leave 2 px between them, less than the 4 px gap.
    assert.equal(boxesOverlap(box(0, 0), box(62, 0)), true);
    assert.equal(boxesOverlap(box(0, 0), box(70, 0)), false);
    assert.equal(boxesOverlap(box(0, 0), box(62, 0), 0), false);
  });

  it('is symmetric', () => {
    const a = box(5, 5, 40, 12);
    const b = box(30, 9, 50, 14);
    assert.equal(boxesOverlap(a, b), boxesOverlap(b, a));
  });
});

describe('isInside', () => {
  const area = { left: 10, top: 10, right: 110, bottom: 60 };
  it('needs the whole box inside, not just its centre', () => {
    assert.equal(isInside(box(60, 35, 40, 10), area), true);
    assert.equal(isInside(box(25, 35, 40, 10), area), false, 'sticks out on the left');
    assert.equal(isInside(box(95, 35, 40, 10), area), false, 'sticks out on the right');
    assert.equal(isInside(box(60, 12, 40, 10), area), false, 'sticks out on the top');
    assert.equal(isInside(box(60, 58, 40, 10), area), false, 'sticks out on the bottom');
  });
});

describe('chooseLabels', () => {
  it('shows everything that does not collide', () => {
    assert.deepEqual(chooseLabels([box(100, 100), box(300, 100), box(100, 200)], screen), [true, true, true]);
  });

  it('prefers the earlier label when two collide', () => {
    assert.deepEqual(chooseLabels([box(100, 100), box(120, 102), box(400, 100)], screen), [true, false, true]);
  });

  it('skips labels that are not wanted, and they do not block anything', () => {
    assert.deepEqual(chooseLabels([null, box(100, 100), null, box(110, 100)], screen), [false, true, false, false]);
  });

  it('a hidden label does not push others away: only kept labels block', () => {
    // b collides with a, so b is dropped; c collides with b but not with a, so c is shown.
    assert.deepEqual(chooseLabels([box(100, 100), box(150, 100), box(200, 100)], screen), [true, false, true]);
  });

  it('drops a label that is cut off by the edge of the area, or lies in a covered part', () => {
    const area = { left: 0, top: 0, right: 400, bottom: 300 };
    assert.deepEqual(chooseLabels([box(20, 100), box(380, 100), box(200, 100), box(200, 295), box(200, 5)], area), [false, false, true, false, false]);
    // a panel covering the right 150 px: the area ends at 250
    assert.deepEqual(chooseLabels([box(230, 100), box(100, 100)], { left: 0, top: 0, right: 250, bottom: 300 }), [false, true]);
  });

  it('handles an empty list', () => {
    assert.deepEqual(chooseLabels([], screen), []);
  });
});
