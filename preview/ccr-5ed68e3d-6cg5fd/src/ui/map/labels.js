// Where to put a label: the point inside a shape that is farthest from its edges (the "pole of
// inaccessibility"), found with the usual quadtree search (the polylabel algorithm). Unlike a
// centroid it never falls outside a crescent-shaped country. Pure and deterministic; the map build
// runs it once and stores the answers, so the phone never has to.

import { distanceToRing, pointInPolygon } from './hit.js';

/** Signed distance to the nearest edge: positive inside the polygon, negative outside. @param {Float64Array[]} polygon @param {number} x @param {number} y */
export function signedDistance(polygon, x, y) {
  let nearest = Infinity;
  for (const ring of polygon) nearest = Math.min(nearest, distanceToRing(ring, x, y));
  return pointInPolygon(polygon, x, y) ? nearest : -nearest;
}

/**
 * @typedef {{ x: number, y: number, half: number, d: number, max: number }} Cell
 * @param {Float64Array[]} polygon exterior ring first, then holes
 * @param {number} x @param {number} y @param {number} half
 * @returns {Cell}
 */
function cellAt(polygon, x, y, half) {
  const d = signedDistance(polygon, x, y);
  return { x, y, half, d, max: d + half * Math.SQRT2 };
}

/** A max-heap on `max`, so the most promising cell comes out first. */
function createQueue() {
  /** @type {Cell[]} */
  const items = [];
  return {
    get length() {
      return items.length;
    },
    /** @param {Cell} cell */
    push(cell) {
      items.push(cell);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (items[parent].max >= items[i].max) break;
        [items[parent], items[i]] = [items[i], items[parent]];
        i = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = /** @type {Cell} */ (items.pop());
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const left = i * 2 + 1;
          const right = left + 1;
          let biggest = i;
          if (left < items.length && items[left].max > items[biggest].max) biggest = left;
          if (right < items.length && items[right].max > items[biggest].max) biggest = right;
          if (biggest === i) break;
          [items[biggest], items[i]] = [items[i], items[biggest]];
          i = biggest;
        }
      }
      return top;
    },
  };
}

/**
 * @param {Float64Array[]} polygon exterior ring first, then holes
 * @param {number} [precision] stop when no cell can beat the best point by more than this
 * @returns {[number, number, number]} x, y and the distance from that point to the nearest edge
 */
export function poleOfInaccessibility(polygon, precision = 1) {
  const ring = polygon[0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]);
    maxX = Math.max(maxX, ring[i]);
    minY = Math.min(minY, ring[i + 1]);
    maxY = Math.max(maxY, ring[i + 1]);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.min(width, height);
  if (size === 0) return [minX, minY, 0];

  const queue = createQueue();
  let half = size / 2;
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) queue.push(cellAt(polygon, x + half, y + half, half));

  let best = cellAt(polygon, minX + width / 2, minY + height / 2, 0); // the middle of the box is a fair first guess
  while (queue.length > 0) {
    const cell = queue.pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    half = cell.half / 2;
    queue.push(cellAt(polygon, cell.x - half, cell.y - half, half));
    queue.push(cellAt(polygon, cell.x + half, cell.y - half, half));
    queue.push(cellAt(polygon, cell.x - half, cell.y + half, half));
    queue.push(cellAt(polygon, cell.x + half, cell.y + half, half));
  }
  return [best.x, best.y, best.d];
}
