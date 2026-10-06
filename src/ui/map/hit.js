// Which region is under a point? A grid of bounding boxes finds the few candidates and exact
// point-in-polygon decides (even-odd, so holes work). Nothing is made "interactive" per polygon
// (ARCHITECTURE §9.3). Small regions can be tapped with a little slop.

/**
 * @typedef {{ id: string, polygons: Float64Array[][] }} HitFeature  rings are flat x,y arrays; the first ring of a polygon is its exterior
 * @typedef {{ id: string, inside: boolean, distance: number }} Hit  distance is 0 when inside, else how far the point is from the shape
 */

/** @param {Float64Array} ring @param {number} x @param {number} y */
export function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd across every ring, so a point in a hole is outside. @param {Float64Array[]} polygon @param {number} x @param {number} y */
export function pointInPolygon(polygon, x, y) {
  let inside = false;
  for (const ring of polygon) if (pointInRing(ring, x, y)) inside = !inside;
  return inside;
}

/** Distance from a point to the nearest edge of a ring. @param {Float64Array} ring @param {number} x @param {number} y */
export function distanceToRing(ring, x, y) {
  let best = Infinity;
  for (let i = 2; i < ring.length; i += 2) {
    const ax = ring[i - 2];
    const ay = ring[i - 1];
    const dx = ring[i] - ax;
    const dy = ring[i + 1] - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/**
 * @param {HitFeature[]} features
 * @param {{ cell?: number }} [options] grid cell size in world units
 */
export function createHitIndex(features, { cell = 64 } = {}) {
  /** @type {Array<{ feature: number, polygon: Float64Array[], minX: number, minY: number, maxX: number, maxY: number }>} */
  const parts = [];
  /** @type {Map<number, number[]>} */
  const grid = new Map();
  const key = (/** @type {number} */ cx, /** @type {number} */ cy) => cx * 100_000 + cy;

  features.forEach((feature, index) => {
    for (const polygon of feature.polygons) {
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
      const part = parts.length;
      parts.push({ feature: index, polygon, minX, minY, maxX, maxY });
      for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx++) {
        for (let cy = Math.floor(minY / cell); cy <= Math.floor(maxY / cell); cy++) {
          const k = key(cx, cy);
          const list = grid.get(k);
          if (list) list.push(part);
          else grid.set(k, [part]);
        }
      }
    }
  });

  /** Parts whose cells overlap a box around the point. @param {number} x @param {number} y @param {number} reach */
  function nearby(x, y, reach) {
    /** @type {Set<number>} */
    const found = new Set();
    for (let cx = Math.floor((x - reach) / cell); cx <= Math.floor((x + reach) / cell); cx++) {
      for (let cy = Math.floor((y - reach) / cell); cy <= Math.floor((y + reach) / cell); cy++) {
        for (const part of grid.get(key(cx, cy)) ?? []) found.add(part);
      }
    }
    return found;
  }

  return {
    /**
     * The feature containing the point, or - when `slop` is given and nothing contains it - the nearest
     * feature within that many world units.
     * @param {number} x @param {number} y @param {number} [slop]
     * @returns {Hit | null}
     */
    hit(x, y, slop = 0) {
      for (const part of nearby(x, y, 0)) {
        const p = parts[part];
        if (x >= p.minX && x <= p.maxX && y >= p.minY && y <= p.maxY && pointInPolygon(p.polygon, x, y)) {
          return { id: features[p.feature].id, inside: true, distance: 0 };
        }
      }
      if (slop <= 0) return null;
      /** @type {Hit | null} */
      let best = null;
      for (const part of nearby(x, y, slop)) {
        const p = parts[part];
        if (x < p.minX - slop || x > p.maxX + slop || y < p.minY - slop || y > p.maxY + slop) continue;
        const distance = Math.min(...p.polygon.map((ring) => distanceToRing(ring, x, y)));
        if (distance <= slop && (!best || distance < best.distance)) best = { id: features[p.feature].id, inside: false, distance };
      }
      return best;
    },
  };
}
