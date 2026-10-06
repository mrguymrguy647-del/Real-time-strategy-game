// When does the grey world need a crisp redraw? The decision is a pure function of the camera, so it is
// tested with numbers: no redraw while the theater's own pictures cover the screen or the overview is
// sharp enough, a redraw with a margin otherwise, and no new one while the old one still serves.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DETAIL, planDetail } from '../../src/ui/map/detail.js';
import { visibleBounds } from '../../src/ui/map/view.js';

const theater = { minX: 0, minY: 0, maxX: 3072, maxY: 2742 };
const worldRect = { minX: -12000, minY: -6000, maxX: 15000, maxY: 9800 };
const phone = { width: 390, height: 844 };
const overviewPxPerUnit = 2048 / (worldRect.maxX - worldRect.minX); // about 0.076
const base = { viewport: phone, dpr: 2, theater, worldRect, overviewPxPerUnit, current: null };
const centred = (/** @type {number} */ zoom, cx = 1536, cy = 1371) => ({ cx, cy, zoom });

describe('planDetail', () => {
  it('does nothing while the theater covers the whole screen', () => {
    assert.deepEqual(planDetail({ ...base, view: centred(0.5) }), { action: 'clear' });
    assert.deepEqual(planDetail({ ...base, view: centred(1.6) }), { action: 'clear' });
  });

  it('draws the surroundings when the screen shows more than the theater (the opening view of a tall phone)', () => {
    const plan = planDetail({ ...base, view: centred(0.127) });
    assert.equal(plan.action, 'render');
    if (plan.action !== 'render') return;
    const seen = visibleBounds(centred(0.127), phone);
    assert.ok(plan.rect.minX <= seen.minX && plan.rect.maxX >= seen.maxX && plan.rect.minY <= seen.minY && plan.rect.maxY >= seen.maxY, 'covers the screen');
    assert.ok(plan.rect.maxX - plan.rect.minX > (seen.maxX - seen.minX) * (1 + DETAIL.margin), 'and a margin around it');
    assert.ok(Math.abs(plan.pxPerUnit - 0.127) < 1e-9, 'at css-pixel density, not the phone\'s full density (dpr 2)');
  });

  it('keeps the overview when it is already sharp (the whole world on one screen)', () => {
    assert.deepEqual(planDetail({ ...base, view: centred(0.0144, 1500, 1900) }), { action: 'clear' });
  });

  it('never goes beyond the world, and never asks for more pixels than the budget', () => {
    const plan = planDetail({ ...base, viewport: { width: 1200, height: 900 }, view: centred(0.2, 12000, 8000) });
    assert.equal(plan.action, 'render');
    if (plan.action !== 'render') return;
    assert.ok(plan.rect.maxX <= worldRect.maxX && plan.rect.maxY <= worldRect.maxY && plan.rect.minX >= worldRect.minX);
    const pixels = (plan.rect.maxX - plan.rect.minX) * (plan.rect.maxY - plan.rect.minY) * plan.pxPerUnit ** 2;
    assert.ok(pixels <= DETAIL.maxPixels * 1.001, `${pixels} pixels`);
  });

  it('keeps a redraw that still covers the screen at about the right density', () => {
    const first = planDetail({ ...base, view: centred(0.3, 1536, -1500) });
    assert.equal(first.action, 'render');
    if (first.action !== 'render') return;
    const current = { rect: first.rect, pxPerUnit: first.pxPerUnit };
    assert.deepEqual(planDetail({ ...base, current, view: centred(0.3, 1536 + 100, -1500 + 100) }), { action: 'keep' }, 'a short pan');
    assert.deepEqual(planDetail({ ...base, current, view: centred(0.33, 1536, -1500) }), { action: 'keep' }, 'a small zoom');
    assert.equal(planDetail({ ...base, current, view: centred(0.3, 1536 + 4000, -1500) }).action, 'render', 'a long pan leaves its margin');
    assert.equal(planDetail({ ...base, current, view: centred(0.8, 1536, -1500) }).action, 'render', 'a big zoom in needs a denser one');
    assert.equal(planDetail({ ...base, current, view: centred(0.12, 1536, -1500) }).action, 'render', 'a big zoom out shows more than it covers');
  });

  it('clears the redraw when the screen goes back inside the theater, to free its memory', () => {
    const current = { rect: { minX: -500, minY: -500, maxX: 4000, maxY: 4000 }, pxPerUnit: 0.3 };
    assert.deepEqual(planDetail({ ...base, current, view: centred(0.6) }), { action: 'clear' });
  });
});
