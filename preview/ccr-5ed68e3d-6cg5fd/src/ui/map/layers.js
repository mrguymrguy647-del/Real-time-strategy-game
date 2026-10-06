// Which baked pictures the map is made of and which one is shown at a given zoom (ARCHITECTURE §9.2,
// §9.7). Theater: a small picture for the zoomed-out view and a large one for zooming in. World (only
// when it is drawn): one small picture of all of it, shown underneath while the camera moves. The
// theater's small picture comes first; the others are baked after the first frame has been shown.

import { bakeMap, bakeWorld } from './bake.js';
import { DEPTH } from './phaserMap.js';

// The pictures shown small have power-of-two sides, so the graphics card can average them down
// smoothly when the map is zoomed far out (mipmaps; see phaserMap.js). The sharp one is shown at
// about its own size or larger, so it does not need that.
export const LOW = { key: 'map-low', width: 1024, height: 1024 };
export const HIGH = { key: 'map-high', width: 3072 };
export const OVERVIEW = { key: 'map-world', width: 2048, height: 1024 };
/** Device pixels per world unit above which the large picture is used (with some hysteresis). */
export const SWITCH_UP = 0.6;
export const SWITCH_DOWN = 0.5;

/**
 * The picture to have before the first frame: the theater, small, so quick to bake.
 * @param {import('./mapData.js').MapGeometry} geometry
 * @returns {import('./phaserMap.js').Layer[]}
 */
export function startLayers(geometry) {
  const edgeFade = !geometry.world; // with the world around it, the theater needs no fade into the sea
  return [{ key: LOW.key, canvas: bakeMap(geometry, { width: LOW.width, height: LOW.height, edgeFade }), rect: geometry.theater, depth: DEPTH.theater }];
}

/** The small picture of the whole world, baked once the first frame is up. @param {import('./mapData.js').MapGeometry} geometry @returns {import('./phaserMap.js').Layer} */
export function worldLayer(geometry) {
  return { key: OVERVIEW.key, canvas: bakeWorld(geometry, { width: OVERVIEW.width, height: OVERVIEW.height }), rect: /** @type {import('./mapData.js').WorldGeometry} */ (geometry.world).rect, depth: DEPTH.overview };
}

/** The sharp theater picture, baked once the first frame is up. @param {import('./mapData.js').MapGeometry} geometry @returns {import('./phaserMap.js').Layer} */
export function sharpLayer(geometry) {
  return { key: HIGH.key, canvas: bakeMap(geometry, { width: HIGH.width, edgeFade: !geometry.world }), rect: geometry.theater, depth: DEPTH.theater };
}

/** Canvas pixels per world unit of the overview picture of the world, or 0 when there is no world. @param {import('./mapData.js').MapGeometry} geometry */
export function overviewDensity(geometry) {
  return geometry.world ? OVERVIEW.width / (geometry.world.rect.maxX - geometry.world.rect.minX) : 0;
}

/**
 * Whether the sharp theater picture should be the one shown.
 * @param {number} deviceScale device pixels per world unit @param {boolean} shownNow @param {boolean} ready
 */
export const wantsSharp = (deviceScale, shownNow, ready) => ready && (shownNow ? deviceScale >= SWITCH_DOWN : deviceScale >= SWITCH_UP);
