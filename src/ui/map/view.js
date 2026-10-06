// The map camera as plain numbers (no Phaser, no DOM), so it can be tested. A view says which world
// point is at the centre of the screen and how many CSS pixels one world unit takes (zoom).
// "World" units are the pixels of the most detailed baked texture; y grows downwards like the screen.

/**
 * @typedef {{ cx: number, cy: number, zoom: number }} View
 * @typedef {{ width: number, height: number }} Viewport  the map's size in CSS pixels
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds  a rectangle in world units
 * @typedef {{ min: number, max: number }} ZoomRange
 * @typedef {{ top: number, right: number, bottom: number, left: number }} Insets  parts of the screen a panel covers, in CSS pixels
 */

/** @type {Insets} */
export const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

/** @param {View} view @param {Viewport} viewport @param {number} x @param {number} y screen position @returns {[number, number]} */
export function screenToWorld(view, viewport, x, y) {
  return [view.cx + (x - viewport.width / 2) / view.zoom, view.cy + (y - viewport.height / 2) / view.zoom];
}

/** @param {View} view @param {Viewport} viewport @param {number} x @param {number} y world position @returns {[number, number]} */
export function worldToScreen(view, viewport, x, y) {
  return [viewport.width / 2 + (x - view.cx) * view.zoom, viewport.height / 2 + (y - view.cy) * view.zoom];
}

/** The part of the world on screen. @param {View} view @param {Viewport} viewport @returns {Bounds} */
export function visibleBounds(view, viewport) {
  const halfW = viewport.width / 2 / view.zoom;
  const halfH = viewport.height / 2 / view.zoom;
  return { minX: view.cx - halfW, minY: view.cy - halfH, maxX: view.cx + halfW, maxY: view.cy + halfH };
}

/** The zoom at which a rectangle just fits the screen, with a margin in CSS pixels. @param {Viewport} viewport @param {Bounds} bounds @param {number} [margin] */
export function fitZoom(viewport, bounds, margin = 0) {
  const w = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const h = Math.max(bounds.maxY - bounds.minY, 1e-6);
  return Math.min(Math.max(viewport.width - margin * 2, 1) / w, Math.max(viewport.height - margin * 2, 1) / h);
}

/** A view that shows a rectangle, centred. @param {Viewport} viewport @param {Bounds} bounds @param {number} [margin] @returns {View} */
export function viewFor(viewport, bounds, margin = 0) {
  return { cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2, zoom: fitZoom(viewport, bounds, margin) };
}

/**
 * Keep the view sensible: zoom inside its range, and the map never lost off screen. When the whole
 * map is smaller than the screen it stays centred; otherwise the screen centre may wander a little
 * past the edge (a slack of a quarter of the screen) so edge regions can be tapped comfortably.
 * Panels that cover part of the screen (insets) are handled by working on the part left uncovered,
 * so a country at the edge of the map can still be brought out from behind an info sheet.
 * @param {View} view @param {Viewport} viewport @param {Bounds} bounds @param {ZoomRange} range @param {Insets} [insets] @returns {View}
 */
export function clampView(view, viewport, bounds, range, insets = NO_INSETS) {
  const zoom = clamp(view.zoom, range.min, range.max);
  const freeWidth = Math.max(viewport.width - insets.left - insets.right, 120);
  const freeHeight = Math.max(viewport.height - insets.top - insets.bottom, 120);
  // The middle of the uncovered part is off the screen centre by half the difference of the insets.
  const shiftX = (insets.left - insets.right) / 2 / zoom;
  const shiftY = (insets.top - insets.bottom) / 2 / zoom;
  /** @param {number} centre @param {number} half @param {number} low @param {number} high */
  const axis = (centre, half, low, high) => {
    if (half * 2 >= high - low) return (low + high) / 2;
    const slack = half / 2;
    return clamp(centre, low + half - slack, high - half + slack);
  };
  return {
    cx: axis(view.cx + shiftX, freeWidth / 2 / zoom, bounds.minX, bounds.maxX) - shiftX,
    cy: axis(view.cy + shiftY, freeHeight / 2 / zoom, bounds.minY, bounds.maxY) - shiftY,
    zoom,
  };
}

/** Drag by a number of screen pixels: the map follows the finger. @param {View} view @param {number} dx @param {number} dy @returns {View} */
export function panBy(view, dx, dy) {
  return { cx: view.cx - dx / view.zoom, cy: view.cy - dy / view.zoom, zoom: view.zoom };
}

/**
 * Multiply the zoom while the world point under a screen position stays exactly where it is.
 * The zoom is not clamped here; clampView does that.
 * @param {View} view @param {Viewport} viewport @param {number} factor @param {number} sx @param {number} sy @returns {View}
 */
export function zoomAbout(view, viewport, factor, sx, sy) {
  const zoom = view.zoom * factor;
  const [wx, wy] = screenToWorld(view, viewport, sx, sy);
  return { cx: wx - (sx - viewport.width / 2) / zoom, cy: wy - (sy - viewport.height / 2) / zoom, zoom };
}

/**
 * One animation step of a flick after the finger lifts: the speed decays smoothly to a stop.
 * @param {{ vx: number, vy: number }} velocity pixels per millisecond
 * @param {number} dtMs
 * @param {number} [halfLifeMs]
 * @returns {{ dx: number, dy: number, vx: number, vy: number, moving: boolean }} dx and dy are the pixels to pan this step
 */
export function flingStep({ vx, vy }, dtMs, halfLifeMs = 160) {
  const keep = 0.5 ** (dtMs / halfLifeMs);
  // The distance covered while slowing from v to v*keep is v * halfLife/ln2 * (1 - keep).
  const travel = (halfLifeMs / Math.LN2) * (1 - keep);
  const next = { vx: vx * keep, vy: vy * keep };
  return { dx: vx * travel, dy: vy * travel, ...next, moving: Math.hypot(next.vx, next.vy) > 0.02 };
}
