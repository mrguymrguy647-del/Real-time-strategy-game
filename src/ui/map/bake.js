// Draws the map into canvases, which Phaser then just shows through its camera. The base layers are
// baked, never redrawn per frame (ARCHITECTURE §9.2; the sandbox measured about 6x the frame rate).
// The theater is baked per detail level: a small canvas for the zoomed-out view, a large one for
// zooming in. The grey rest of the world is baked once, small, as the picture shown while the camera
// moves, and drawn again as crisp vectors for what is on screen once it holds still (§9.7). Canvas2D
// does the filling, so concave shapes and holes just work.

import { boxesIntersect } from './box.js';
import { COUNTRY_PALETTE } from './coloring.js';
import { ARC } from './mapData.js';

/** The grey neighbours fade into the sea over this many world units at the map's edge. */
const FADE_WORLD = 110;

export const STYLE = {
  sea: '#0e2338',
  seaClear: 'rgba(14, 35, 56, 0)', // the sea colour with no opacity: a gradient to it fades without turning grey
  context: '#1f3249',
  contextLine: '#304a68',
  regionLine: 'rgba(8, 16, 30, 0.42)',
  borderLine: 'rgba(8, 16, 30, 0.95)',
  coastLine: 'rgba(6, 13, 26, 0.9)',
};

/** Line widths in canvas pixels at a detail level; coarser levels get slightly heavier lines so they stay visible. @param {number} scale canvas pixels per world unit */
export function lineWidths(scale) {
  const boost = scale < 0.6 ? 1.35 : 1;
  return { region: 0.9 * boost, border: 1.7 * boost, coast: 1.3 * boost, context: 1 * boost };
}

/** Mix a #rrggbb color toward white (amount > 0) or black (amount < 0). @param {string} hex @param {number} amount -1..1 */
export function shade(hex, amount) {
  const target = amount >= 0 ? 255 : 0;
  const mix = Math.abs(amount);
  const part = (/** @type {number} */ shift) => {
    const value = (parseInt(hex.slice(1), 16) >> shift) & 255;
    return Math.round(value + (target - value) * mix);
  };
  return `#${((1 << 24) | (part(16) << 16) | (part(8) << 8) | part(0)).toString(16).slice(1)}`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./topology.js').Polygon[]} polygons
 */
function tracePolygons(ctx, polygons) {
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ctx.moveTo(ring[0], ring[1]);
      for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i], ring[i + 1]);
      ctx.closePath();
    }
  }
}

/**
 * Fill grey shapes (and outline them unless `lineWidth` is 0): they share one style and never overlap,
 * so one path does.
 * @param {CanvasRenderingContext2D} ctx drawing in world units
 * @param {Array<{ polygons: import('./topology.js').Polygon[], box?: import('./box.js').Box }>} shapes
 * @param {number} lineWidth in world units; 0 for no outline
 * @param {import('./box.js').Box} [visible] shapes with a box outside this are skipped
 */
function paintGrey(ctx, shapes, lineWidth, visible) {
  ctx.beginPath();
  for (const shape of shapes) {
    if (visible && shape.box && !boxesIntersect(shape.box, visible)) continue;
    tracePolygons(ctx, shape.polygons);
  }
  ctx.fillStyle = STYLE.context;
  ctx.fill('evenodd');
  if (lineWidth <= 0) return;
  ctx.strokeStyle = STYLE.contextLine;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Stroke the arcs of one kind in one go.
 * @param {CanvasRenderingContext2D} ctx drawing in world units @param {import('./mapData.js').MapGeometry} geometry
 * @param {number} kind an ARC kind @param {string} color @param {number} lineWidth in world units
 */
function strokeArcs(ctx, geometry, kind, color, lineWidth) {
  ctx.beginPath();
  geometry.arcs.forEach((arc, index) => {
    if (geometry.arcKind[index] !== kind) return;
    ctx.moveTo(arc[0], arc[1]);
    for (let i = 2; i < arc.length; i += 2) ctx.lineTo(arc[i], arc[i + 1]);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * A canvas of the given pixel size painted with the sea.
 * @param {() => HTMLCanvasElement} createCanvas @param {number} width @param {number} height
 */
function seaCanvas(createCanvas, width, height) {
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.fillStyle = STYLE.sea;
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

/**
 * The theater: the grey neighbours, the playable regions tinted by country, and their borders.
 * @param {import('./mapData.js').MapGeometry} geometry
 * @param {{ width: number, height?: number, createCanvas?: () => HTMLCanvasElement, edgeFade?: boolean }} options size in pixels of this
 *   detail level (a `height` that is not in proportion stretches the picture, which Phaser shows at the right shape again; a
 *   power of two on both sides lets the graphics card average it down smoothly when it is shown small);
 *   `edgeFade` melts the grey neighbours into the sea at the edge of the map (off when the world is drawn around it)
 * @returns {HTMLCanvasElement}
 */
export function bakeMap(geometry, { width, height, createCanvas = () => document.createElement('canvas'), edgeFade = true }) {
  const sx = width / geometry.width;
  const sy = (height ?? Math.ceil(geometry.height * sx)) / geometry.height;
  const scale = Math.sqrt(sx * sy);
  const { canvas, ctx } = seaCanvas(createCanvas, width, height ?? Math.ceil(geometry.height * sx));
  const lines = lineWidths(scale);
  ctx.scale(sx, sy); // from here on everything is drawn in world units
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // The grey neighbours first, underneath: filled, then outlined along their shared borders and
  // coasts only (not along the box where they were cut off).
  paintGrey(ctx, geometry.context, 0);
  strokeArcs(ctx, geometry, ARC.CONTEXT, STYLE.contextLine, lines.context / scale);

  if (edgeFade) {
    // Fade the grey neighbours into the sea at the edge of the map, so it has no hard rectangle: one
    // strip per side, opaque sea at the edge and clear a little way in.
    const mapWidth = geometry.width;
    const mapHeight = geometry.height;
    const strips = [
      { x: 0, y: 0, w: mapWidth, h: FADE_WORLD, from: [0, 0], to: [0, FADE_WORLD] }, // top
      { x: 0, y: mapHeight - FADE_WORLD, w: mapWidth, h: FADE_WORLD, from: [0, mapHeight], to: [0, mapHeight - FADE_WORLD] }, // bottom
      { x: 0, y: 0, w: FADE_WORLD, h: mapHeight, from: [0, 0], to: [FADE_WORLD, 0] }, // left
      { x: mapWidth - FADE_WORLD, y: 0, w: FADE_WORLD, h: mapHeight, from: [mapWidth, 0], to: [mapWidth - FADE_WORLD, 0] }, // right
    ];
    for (const strip of strips) {
      const gradient = ctx.createLinearGradient(strip.from[0], strip.from[1], strip.to[0], strip.to[1]);
      gradient.addColorStop(0, STYLE.sea);
      gradient.addColorStop(1, STYLE.seaClear);
      ctx.fillStyle = gradient;
      ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
    }
  }

  // The playable regions, tinted by their country; every other region is a touch lighter so the
  // thin lines between regions of one country still read.
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const region of geometry.regions) {
    const nth = seen.get(region.country) ?? 0;
    seen.set(region.country, nth + 1);
    const base = COUNTRY_PALETTE[(geometry.colorOf.get(region.country) ?? 0) % COUNTRY_PALETTE.length];
    ctx.beginPath();
    tracePolygons(ctx, region.polygons);
    ctx.fillStyle = shade(base, nth % 2 === 0 ? -0.08 : 0.06);
    ctx.fill('evenodd');
  }

  // Borders, lightest to heaviest so the important lines are on top.
  strokeArcs(ctx, geometry, ARC.REGION, STYLE.regionLine, lines.region / scale);
  strokeArcs(ctx, geometry, ARC.BORDER, STYLE.borderLine, lines.border / scale);
  strokeArcs(ctx, geometry, ARC.OUTER, STYLE.coastLine, lines.coast / scale);
  return canvas;
}

/**
 * The grey rest of the world as one small canvas that covers the whole world rectangle: the picture
 * shown while the camera moves. The playable countries are drawn grey here too, so no hole shows
 * when the theater's own texture is a pixel off.
 * @param {import('./mapData.js').MapGeometry} geometry must have a world
 * @param {{ width: number, height?: number, createCanvas?: () => HTMLCanvasElement }} options size in pixels (see bakeMap)
 * @returns {HTMLCanvasElement}
 */
export function bakeWorld(geometry, { width, height, createCanvas = () => document.createElement('canvas') }) {
  const world = /** @type {import('./mapData.js').WorldGeometry} */ (geometry.world);
  const { rect } = world;
  const sx = width / (rect.maxX - rect.minX);
  const pixelsHigh = height ?? Math.ceil((rect.maxY - rect.minY) * sx);
  const sy = pixelsHigh / (rect.maxY - rect.minY);
  const { canvas, ctx } = seaCanvas(createCanvas, width, pixelsHigh);
  ctx.setTransform(sx, 0, 0, sy, -rect.minX * sx, -rect.minY * sy);
  const scale = Math.sqrt(sx * sy);
  paintGrey(ctx, [...world.countries, ...geometry.countries], lineWidths(scale).context / scale);
  return canvas;
}

/**
 * Draw the grey world crisply into a canvas for one rectangle of it, at `pxPerUnit` canvas pixels per
 * world unit. Only what meets the rectangle is drawn.
 * @param {HTMLCanvasElement} canvas already sized to the rectangle at that density
 * @param {import('./mapData.js').WorldGeometry} world
 * @param {import('./box.js').Box} rect @param {number} pxPerUnit @param {number} linePx outline width in canvas pixels
 */
export function paintWorldDetail(canvas, world, rect, pxPerUnit, linePx) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = STYLE.sea;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(pxPerUnit, 0, 0, pxPerUnit, -rect.minX * pxPerUnit, -rect.minY * pxPerUnit);
  paintGrey(ctx, world.countries, linePx / pxPerUnit, rect);
}
