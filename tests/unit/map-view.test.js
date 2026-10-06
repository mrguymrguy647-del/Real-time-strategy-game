// The map camera math: converting between screen and world, zooming under a finger, keeping the map
// on screen, and the glide after a flick.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clampView, fitZoom, flingStep, panBy, screenToWorld, viewFor, visibleBounds, worldToScreen, zoomAbout } from '../../src/ui/map/view.js';

const viewport = { width: 400, height: 800 };
const bounds = { minX: 0, minY: 0, maxX: 3000, maxY: 2700 };
const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

describe('screen and world', () => {
  it('puts the view centre at the middle of the screen', () => {
    const view = { cx: 1500, cy: 1350, zoom: 0.5 };
    assert.deepEqual(worldToScreen(view, viewport, 1500, 1350), [200, 400]);
    assert.deepEqual(screenToWorld(view, viewport, 200, 400), [1500, 1350]);
  });

  it('round-trips any point at any zoom', () => {
    for (const zoom of [0.1, 0.5, 1, 4]) {
      const view = { cx: 700, cy: 900, zoom };
      const [sx, sy] = worldToScreen(view, viewport, 1234, 567);
      const [wx, wy] = screenToWorld(view, viewport, sx, sy);
      close(wx, 1234);
      close(wy, 567);
    }
  });

  it('shows more world at lower zoom', () => {
    const near = visibleBounds({ cx: 0, cy: 0, zoom: 2 }, viewport);
    const far = visibleBounds({ cx: 0, cy: 0, zoom: 0.5 }, viewport);
    assert.ok(far.maxX - far.minX > near.maxX - near.minX);
    assert.deepEqual([near.minX, near.maxX], [-100, 100]);
  });
});

describe('fitting', () => {
  it('finds the zoom at which the whole map just fits, limited by the tighter side', () => {
    close(fitZoom(viewport, bounds), 400 / 3000);
    close(fitZoom({ width: 1000, height: 300 }, bounds), 300 / 2700);
  });

  it('keeps a margin in CSS pixels', () => {
    close(fitZoom(viewport, bounds, 20), 360 / 3000);
  });

  it('centres on the rectangle', () => {
    const view = viewFor(viewport, { minX: 100, minY: 200, maxX: 300, maxY: 600 });
    assert.deepEqual([view.cx, view.cy], [200, 400]);
  });
});

describe('zooming', () => {
  it('keeps the world point under the finger fixed', () => {
    const view = { cx: 1000, cy: 1000, zoom: 0.4 };
    const [before] = [screenToWorld(view, viewport, 90, 640)];
    const zoomed = zoomAbout(view, viewport, 3, 90, 640);
    const after = screenToWorld(zoomed, viewport, 90, 640);
    close(zoomed.zoom, 1.2);
    close(after[0], before[0], 1e-9);
    close(after[1], before[1], 1e-9);
  });

  it('zooming about the screen centre does not move the centre', () => {
    const view = { cx: 1000, cy: 1000, zoom: 0.4 };
    const zoomed = zoomAbout(view, viewport, 2, 200, 400);
    close(zoomed.cx, 1000);
    close(zoomed.cy, 1000);
  });
});

describe('panning', () => {
  it('moves the map with the finger: dragging right shows what is to the left', () => {
    const view = panBy({ cx: 1000, cy: 1000, zoom: 0.5 }, 50, -20);
    assert.deepEqual([view.cx, view.cy], [900, 1040]);
  });
});

describe('clampView', () => {
  const range = { min: 0.1, max: 2 };

  it('limits the zoom to its range', () => {
    assert.equal(clampView({ cx: 1500, cy: 1350, zoom: 50 }, viewport, bounds, range).zoom, 2);
    assert.equal(clampView({ cx: 1500, cy: 1350, zoom: 0.001 }, viewport, bounds, range).zoom, 0.1);
  });

  it('centres a map that is smaller than the screen, whatever the pan', () => {
    const view = clampView({ cx: 5, cy: 5, zoom: 0.1 }, viewport, bounds, range);
    assert.deepEqual([view.cx, view.cy], [1500, 1350]);
  });

  it('stops the map being dragged far out of sight when zoomed in', () => {
    const view = clampView({ cx: -9999, cy: 99999, zoom: 1 }, viewport, bounds, range);
    const seen = visibleBounds(view, viewport);
    assert.ok(seen.maxX > bounds.minX, 'some map is still on screen horizontally');
    assert.ok(seen.minY < bounds.maxY, 'some map is still on screen vertically');
  });

  it('leaves a sensible view alone', () => {
    const view = { cx: 1500, cy: 1350, zoom: 0.5 };
    assert.deepEqual(clampView(view, viewport, bounds, range), view);
  });

  describe('with a panel covering part of the screen', () => {
    const zoom = 1;
    const sheet = { top: 0, left: 0, bottom: 0, right: 160 }; // a side sheet; 240 of the 400 px stay uncovered

    it('lets an edge of the map be brought into the uncovered part', () => {
      // Free centre = screen centre + (left - right) / 2 = cx - 80. Without a panel the centre may pass the
      // right edge by at most a quarter of the screen (100); with it, by a quarter of the uncovered part (60).
      const wanted = { cx: 3020, cy: 1350, zoom };
      assert.equal(clampView(wanted, viewport, bounds, range, sheet).cx, 3020, 'the panel makes room for the shift');
      assert.equal(clampView(wanted, viewport, bounds, range).cx, 2900, 'without it the camera is held back');
    });

    it('never loses the map behind the panel: the uncovered part always shows some of it', () => {
      const view = clampView({ cx: 99999, cy: 1350, zoom }, viewport, bounds, range, sheet);
      const left = view.cx - viewport.width / 2 / zoom; // world x at the screen's left edge, where the uncovered part starts
      const right = left + (viewport.width - sheet.right) / zoom; // and where it ends
      assert.ok(left < bounds.maxX && right > bounds.minX);
    });

    it('is the same as no panel when nothing is covered', () => {
      const view = { cx: 700, cy: 900, zoom: 0.8 };
      assert.deepEqual(clampView(view, viewport, bounds, range, { top: 0, right: 0, bottom: 0, left: 0 }), clampView(view, viewport, bounds, range));
    });

    it('centres a map that fits the uncovered part in that part, not on the screen', () => {
      const narrow = { top: 0, left: 0, bottom: 0, right: 50 }; // 350 px left; the map is 300 px across at this zoom
      const view = clampView({ cx: 0, cy: 0, zoom: 0.1 }, viewport, bounds, range, narrow);
      assert.equal(view.cx, 1500 + 50 / 2 / 0.1, 'the screen centre is pushed right so the map sits left of the panel');
    });
  });
});

describe('flingStep', () => {
  it('glides in the direction of the flick and slows down', () => {
    let velocity = { vx: 1, vy: -0.5 };
    let total = 0;
    let steps = 0;
    for (; steps < 600; steps++) {
      const step = flingStep(velocity, 16);
      assert.ok(step.dx > 0 && step.dy < 0);
      total += step.dx;
      velocity = { vx: step.vx, vy: step.vy };
      if (!step.moving) break;
    }
    assert.ok(steps < 100, 'it comes to rest within a couple of seconds');
    // The distance of an exponential glide from speed v is v * halfLife / ln 2 (about 231 px here),
    // minus the few pixels it would still have covered when it was cut off at the stopping speed.
    assert.ok(total > 220 && total < 231.5, `glided ${total} px`);
  });

  it('does not depend on how the time is cut into frames', () => {
    const run = (/** @type {number} */ dt) => {
      let velocity = { vx: 0.8, vy: 0 };
      let total = 0;
      for (let t = 0; t < 1000; t += dt) {
        const step = flingStep(velocity, dt);
        total += step.dx;
        velocity = { vx: step.vx, vy: step.vy };
      }
      return total;
    };
    close(run(10), run(20), 0.5);
  });

  it('stops when the speed is negligible', () => {
    assert.equal(flingStep({ vx: 0.01, vy: 0 }, 16).moving, false);
  });
});
