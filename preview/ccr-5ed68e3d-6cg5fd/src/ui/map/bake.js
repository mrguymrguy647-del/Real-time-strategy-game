// Draws the whole map once into a canvas, which Phaser then just shows through its camera. The base
// layer is baked, never redrawn per frame (ARCHITECTURE §9.2; the sandbox measured about 6x the
// frame rate). A canvas is baked per detail level: a small one for the zoomed-out view, a large one
// for zooming in. Canvas2D does the filling, so concave shapes and holes just work.

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
 * @param {import('./mapData.js').MapGeometry} geometry
 * @param {{ width: number, createCanvas?: () => HTMLCanvasElement }} options width in pixels of this detail level
 * @returns {HTMLCanvasElement}
 */
export function bakeMap(geometry, { width, createCanvas = () => document.createElement('canvas') }) {
  const scale = width / geometry.width;
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = Math.ceil(geometry.height * scale);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const lines = lineWidths(scale);

  ctx.fillStyle = STYLE.sea;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale); // from here on everything is drawn in world units
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // The grey neighbours first, underneath.
  ctx.beginPath();
  for (const shape of geometry.context) tracePolygons(ctx, shape.polygons);
  ctx.fillStyle = STYLE.context;
  ctx.fill('evenodd');
  ctx.strokeStyle = STYLE.contextLine;
  ctx.lineWidth = lines.context / scale;
  ctx.stroke();

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
  for (const [kind, color, px] of /** @type {const} */ ([
    [ARC.REGION, STYLE.regionLine, lines.region],
    [ARC.BORDER, STYLE.borderLine, lines.border],
    [ARC.OUTER, STYLE.coastLine, lines.coast],
  ])) {
    ctx.beginPath();
    geometry.arcs.forEach((arc, index) => {
      if (geometry.arcKind[index] !== kind) return;
      ctx.moveTo(arc[0], arc[1]);
      for (let i = 2; i < arc.length; i += 2) ctx.lineTo(arc[i], arc[i + 1]);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = px / scale;
    ctx.stroke();
  }
  return canvas;
}
