// Colors for the countries: a graph-coloring pass over a small palette so neighbours always differ
// (ARCHITECTURE §9.2). DSATUR order, ties broken by id, so the result is the same every time.

/**
 * Muted, distinguishable on a dark sea, and kept apart in hue and lightness for colour-blind eyes.
 * The playable land is drawn from this; the grey context around it is not.
 */
export const COUNTRY_PALETTE = ['#c9793f', '#4a90c2', '#6aa56f', '#d3b04d', '#9a7bb8', '#4fb3b0', '#c9779d', '#a9ad63'];

/**
 * @param {string[]} nodes
 * @param {Map<string, Set<string>>} neighbours
 * @param {number} colorCount how many colors may be used
 * @returns {Map<string, number>} color index per node
 */
export function colorGraph(nodes, neighbours, colorCount = COUNTRY_PALETTE.length) {
  /** @type {Map<string, number>} */
  const assigned = new Map();
  const remaining = new Set([...nodes].sort());
  const usedAround = (/** @type {string} */ node) => new Set([...(neighbours.get(node) ?? [])].filter((n) => assigned.has(n)).map((n) => /** @type {number} */ (assigned.get(n))));

  while (remaining.size > 0) {
    // Most constrained first: the most distinct neighbour colors, then the most neighbours, then the id.
    let next = '';
    let bestSaturation = -1;
    let bestDegree = -1;
    for (const node of remaining) {
      const saturation = usedAround(node).size;
      const degree = neighbours.get(node)?.size ?? 0;
      if (saturation > bestSaturation || (saturation === bestSaturation && degree > bestDegree)) {
        next = node;
        bestSaturation = saturation;
        bestDegree = degree;
      }
    }
    const used = usedAround(next);
    let color = 0;
    while (color < colorCount && used.has(color)) color++;
    if (color === colorCount) {
      // Out of colors (not possible for a planar map with 5+ colors): reuse the one seen least around it.
      const counts = new Array(colorCount).fill(0);
      for (const n of neighbours.get(next) ?? []) if (assigned.has(n)) counts[/** @type {number} */ (assigned.get(n))]++;
      color = counts.indexOf(Math.min(...counts));
    }
    assigned.set(next, color);
    remaining.delete(next);
  }
  return assigned;
}
