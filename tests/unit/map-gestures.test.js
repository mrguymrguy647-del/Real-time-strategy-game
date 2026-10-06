// Scripted fingers: taps, drags, pinches and flicks as the pointer events arrive on a phone.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TAP_MS, TAP_SLOP, createGestures } from '../../src/ui/map/gestures.js';

/** A gesture recognizer that records what it reports. */
function setup() {
  /** @type {any[]} */
  const log = [];
  const g = createGestures({
    onPan: (dx, dy) => log.push(['pan', dx, dy]),
    onPinch: (p) => log.push(['pinch', p]),
    onTap: (x, y) => log.push(['tap', x, y]),
    onFling: (vx, vy) => log.push(['fling', vx, vy]),
    onStart: () => log.push(['start']),
  });
  const kinds = () => log.map((e) => e[0]);
  return { g, log, kinds };
}

describe('tap', () => {
  it('is a quick touch that stays put', () => {
    const { g, log } = setup();
    g.down(1, 120, 300, 0);
    g.move(1, 123, 302, 40);
    g.up(1, 123, 302, 90);
    assert.deepEqual(log, [['start'], ['tap', 123, 302]]);
  });

  it('is not a tap when it lasts too long (a long press)', () => {
    const { g, kinds } = setup();
    g.down(1, 120, 300, 0);
    g.up(1, 120, 300, TAP_MS + 50);
    assert.deepEqual(kinds(), ['start']);
  });

  it('is not a tap once the finger moved beyond the slop, even if it comes back', () => {
    const { g, kinds } = setup();
    g.down(1, 100, 100, 0);
    g.move(1, 100 + TAP_SLOP + 5, 100, 20);
    g.move(1, 100, 100, 40);
    g.up(1, 100, 100, 60);
    assert.ok(!kinds().includes('tap'));
  });

  it('is not a tap when a second finger touched', () => {
    const { g, kinds } = setup();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    g.up(2, 200, 100, 50);
    g.up(1, 100, 100, 60);
    assert.ok(!kinds().includes('tap'));
  });

  it('is cancelled when the system takes the touch away', () => {
    const { g, kinds } = setup();
    g.down(1, 100, 100, 0);
    g.cancel(1);
    g.up(1, 100, 100, 30);
    assert.ok(!kinds().includes('tap'));
    assert.equal(g.active, 0);
  });
});

describe('drag', () => {
  it('ignores jitter inside the slop, then pans by the full distance so the map catches up', () => {
    const { g, log } = setup();
    g.down(1, 100, 100, 0);
    g.move(1, 104, 100, 10); // inside the slop
    assert.deepEqual(log, [['start']]);
    g.move(1, 112, 100, 20); // beyond it: pan by everything since the start
    assert.deepEqual(log[1], ['pan', 12, 0]);
    g.move(1, 120, 90, 30);
    assert.deepEqual(log[2], ['pan', 8, -10]);
  });

  it('keeps panning with the remaining finger after a pinch, without a jump', () => {
    const { g, log } = setup();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 5);
    g.move(2, 220, 100, 10); // pinch
    g.up(2, 220, 100, 20);
    g.move(1, 110, 100, 30);
    const last = log[log.length - 1];
    assert.deepEqual(last, ['pan', 10, 0]);
  });
});

describe('pinch', () => {
  it('reports the change in spread and the midpoint movement', () => {
    const { g, log } = setup();
    g.down(1, 100, 400, 0);
    g.down(2, 200, 400, 5);
    g.move(2, 300, 400, 10); // spread 100 -> 200, midpoint 150 -> 200
    const pinch = log.find((e) => e[0] === 'pinch')[1];
    assert.equal(pinch.scale, 2);
    assert.deepEqual([pinch.x, pinch.y], [200, 400]);
    assert.deepEqual([pinch.dx, pinch.dy], [50, 0]);
  });

  it('pinching in gives a scale below 1', () => {
    const { g, log } = setup();
    g.down(1, 100, 400, 0);
    g.down(2, 300, 400, 5);
    g.move(1, 150, 400, 10); // spread 200 -> 150
    assert.equal(log.find((e) => e[0] === 'pinch')[1].scale, 0.75);
  });

  it('ignores a third finger', () => {
    const { g } = setup();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 5);
    g.down(3, 300, 100, 6);
    assert.equal(g.active, 2);
  });
});

describe('fling', () => {
  it('reports the speed of a quick drag that ends while still moving', () => {
    const { g, log } = setup();
    g.down(1, 100, 100, 0);
    for (let i = 1; i <= 8; i++) g.move(1, 100 + i * 16, 100, i * 16); // 1 px per ms
    g.up(1, 228, 100, 135);
    const fling = log.find((e) => e[0] === 'fling');
    assert.ok(fling, 'a fling is reported');
    assert.ok(Math.abs(fling[1] - 1) < 0.01 && fling[2] === 0);
  });

  it('is not reported when the finger rested before lifting', () => {
    const { g, kinds } = setup();
    g.down(1, 100, 100, 0);
    for (let i = 1; i <= 8; i++) g.move(1, 100 + i * 16, 100, i * 16);
    g.up(1, 228, 100, 128 + 400); // held still for 400 ms
    assert.ok(!kinds().includes('fling'));
  });

  it('is not reported for a slow drag', () => {
    const { g, kinds } = setup();
    g.down(1, 100, 100, 0);
    for (let i = 1; i <= 8; i++) g.move(1, 100 + i * 9, 100, i * 50); // 0.18 px per ms
    g.up(1, 172, 100, 410);
    assert.ok(!kinds().includes('fling'));
  });
});
