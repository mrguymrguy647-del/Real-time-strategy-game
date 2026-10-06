// The crisp redraw of the grey world (ARCHITECTURE §9.7). The world is far too big to bake sharp: one
// small canvas of all of it is shown while the camera moves, and once the camera has held still for a
// moment the part on screen (plus a margin) is drawn again as vectors at the screen's own resolution.
// The theater has its own sharp textures and sits on top, so a view that stays inside it never needs
// this. The decision of what to redraw is a pure function (planDetail), tested without a browser.

import { boxContains, expandBox, intersectBoxes } from './box.js';
import { paintWorldDetail } from './bake.js';
import { visibleBounds } from './view.js';

export const DETAIL = {
  /** How long the camera must hold still before the redraw, in milliseconds. */
  settleMs: 140,
  /** The redraw covers the screen plus this share of it on every side, so a short pan stays sharp. */
  margin: 0.3,
  /**
   * Canvas pixels per CSS pixel the redraw is drawn at. The grey world is only scenery, so it does not
   * need a phone's full resolution (that would be four times the pixels to fill, on every redraw).
   */
  maxDensity: 1,
  /** The most canvas pixels a redraw may use (about 8 MB), so a big screen gets a slightly softer one. */
  maxPixels: 2_000_000,
  /** The grey outlines are this wide in canvas pixels, which comes out near the theater's own thin lines. */
  linePx: 0.7,
  /** A redraw is kept while its density is within this band of what the screen wants now. */
  keepBand: /** @type {[number, number]} */ ([0.75, 1.8]),
  /** The overview picture counts as sharp up to this many device pixels per one of its own pixels. */
  overviewSharp: 1.15,
};

/**
 * @typedef {{ rect: import('./box.js').Box, pxPerUnit: number }} DetailPlan
 * @typedef {{ action: 'keep' } | { action: 'clear' } | ({ action: 'render' } & DetailPlan)} Decision
 */

/**
 * What to do about the redraw for the current view.
 * @param {{
 *   view: import('./view.js').View, viewport: import('./view.js').Viewport, dpr: number,
 *   theater: import('./box.js').Box, worldRect: import('./box.js').Box,
 *   overviewPxPerUnit: number, current: DetailPlan | null,
 * }} input
 * @returns {Decision}
 *   `clear`: nothing on screen needs it (free the memory); `keep`: the current one still serves; `render`: draw this
 */
export function planDetail({ view, viewport, dpr, theater, worldRect, overviewPxPerUnit, current }) {
  const visible = visibleBounds(view, viewport);
  if (boxContains(theater, visible)) return { action: 'clear' }; // the theater's own textures cover the whole screen
  if (view.zoom * dpr <= overviewPxPerUnit * DETAIL.overviewSharp) return { action: 'clear' }; // the overview picture is sharp enough at device resolution
  const wanted = view.zoom * Math.min(dpr, DETAIL.maxDensity); // canvas pixels per world unit
  if (current && boxContains(current.rect, visible) && current.pxPerUnit >= wanted * DETAIL.keepBand[0] && current.pxPerUnit <= wanted * DETAIL.keepBand[1]) {
    return { action: 'keep' };
  }
  const rect = intersectBoxes(expandBox(visible, DETAIL.margin), worldRect);
  if (!rect) return { action: 'clear' };
  const area = (rect.maxX - rect.minX) * (rect.maxY - rect.minY);
  return { action: 'render', rect, pxPerUnit: Math.min(wanted, Math.sqrt(DETAIL.maxPixels / area)) };
}

/**
 * @param {{
 *   phaser: { setDetail: (canvas: HTMLCanvasElement, rect: import('./box.js').Box) => void, clearDetail: () => void },
 *   world: import('./mapData.js').WorldGeometry,
 *   theater: import('./box.js').Box,
 *   overviewPxPerUnit: number,
 *   getState: () => { view: import('./view.js').View, viewport: import('./view.js').Viewport, dpr: number },
 *   onChange: () => void,
 *   createCanvas?: () => HTMLCanvasElement,
 * }} options
 */
export function createDetail({ phaser, world, theater, overviewPxPerUnit, getState, onChange, createCanvas = () => document.createElement('canvas') }) {
  /** @type {HTMLCanvasElement | null} */
  let canvas = null;
  /** @type {DetailPlan | null} */
  let current = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let renders = 0;
  let lastMs = 0;

  /** Do what the current view calls for. Returns what was done. */
  function renderNow() {
    clearTimeout(timer);
    const { view, viewport, dpr } = getState();
    const decision = planDetail({ view, viewport, dpr, theater, worldRect: world.rect, overviewPxPerUnit, current });
    if (decision.action === 'clear') {
      if (current) {
        phaser.clearDetail();
        current = null;
      }
    } else if (decision.action === 'render') {
      const started = performance.now();
      canvas ??= createCanvas();
      canvas.width = Math.max(1, Math.round((decision.rect.maxX - decision.rect.minX) * decision.pxPerUnit));
      canvas.height = Math.max(1, Math.round((decision.rect.maxY - decision.rect.minY) * decision.pxPerUnit));
      paintWorldDetail(canvas, world, decision.rect, decision.pxPerUnit, DETAIL.linePx);
      phaser.setDetail(canvas, decision.rect);
      current = { rect: decision.rect, pxPerUnit: decision.pxPerUnit };
      renders++;
      lastMs = performance.now() - started;
    }
    return decision.action;
  }

  return {
    renderNow,

    /** Redraw once the camera has held still for a moment. */
    settle() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (renderNow() !== 'keep') onChange();
      }, DETAIL.settleMs);
    },

    /** The camera moved again: forget the pending redraw. */
    cancel() {
      clearTimeout(timer);
    },

    /** The part of the world the crisp redraw covers right now, or null. */
    coverage: () => current?.rect ?? null,

    info: () => ({ active: current !== null, rect: current ? { ...current.rect } : null, pxPerUnit: current?.pxPerUnit ?? 0, renders, lastMs }),

    destroy() {
      clearTimeout(timer);
      phaser.clearDetail();
      current = null;
      canvas = null;
    },
  };
}
