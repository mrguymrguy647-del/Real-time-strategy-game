// Rectangles in world units (y down), for culling and for deciding what needs redrawing. Pure.

/** @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box */

/** The bounding box of the exterior rings of some polygons. @param {import('./topology.js').Polygon[]} polygons @returns {Box} */
export function boxOf(polygons) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    const ring = polygon[0];
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]);
      maxX = Math.max(maxX, ring[i]);
      minY = Math.min(minY, ring[i + 1]);
      maxY = Math.max(maxY, ring[i + 1]);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** @param {Box} box */
export const longerSide = (box) => Math.max(box.maxX - box.minX, box.maxY - box.minY);

/** True when the two boxes share any area or touch. @param {Box} a @param {Box} b */
export const boxesIntersect = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** True when `inner` lies entirely inside `outer`. @param {Box} outer @param {Box} inner */
export const boxContains = (outer, inner) => inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;

/** Grow a box by a share of its own size on every side. @param {Box} box @param {number} share */
export function expandBox(box, share) {
  const dx = (box.maxX - box.minX) * share;
  const dy = (box.maxY - box.minY) * share;
  return { minX: box.minX - dx, minY: box.minY - dy, maxX: box.maxX + dx, maxY: box.maxY + dy };
}

/** The part both boxes cover, or null when they do not meet. @param {Box} a @param {Box} b @returns {Box | null} */
export function intersectBoxes(a, b) {
  if (!boxesIntersect(a, b)) return null;
  return { minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY), maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY) };
}
