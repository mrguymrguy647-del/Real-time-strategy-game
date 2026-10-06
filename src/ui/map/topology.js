// Reads the map geometry (data/map/<theater>.topo.json, written by tools/build-map.mjs).
// It is a TopoJSON file: shared borders are stored once as arcs, so neighbours never have gaps or
// overlaps. This is the little of TopoJSON the game needs, so there is no runtime dependency.
// Coordinates are map units: kilometres in Mercator, x to the east and y to the NORTH.

/**
 * @typedef {{ type: string, arcs?: any, properties?: Record<string, any>, geometries?: any[] }} TopoGeometry
 * @typedef {{
 *   type: 'Topology',
 *   transform?: { scale: [number, number], translate: [number, number] },
 *   arcs: number[][][],
 *   objects: Record<string, TopoGeometry>,
 * }} Topology
 * @typedef {Float64Array[]} Polygon  the exterior ring first, then any holes; a ring is x0,y0,x1,y1,... and closed
 * @typedef {{ properties: Record<string, any>, polygons: Polygon[] }} MapFeature
 */

/**
 * Turn the quantized, delta-encoded arcs into absolute points.
 * @param {Topology} topology
 * @returns {Float64Array[]} one flat x,y array per arc
 */
export function decodeArcs(topology) {
  const [sx, sy] = topology.transform?.scale ?? [1, 1];
  const [tx, ty] = topology.transform?.translate ?? [0, 0];
  const quantized = Boolean(topology.transform);
  return topology.arcs.map((arc) => {
    const out = new Float64Array(arc.length * 2);
    let x = 0;
    let y = 0;
    arc.forEach((point, i) => {
      if (quantized) {
        x += point[0];
        y += point[1];
        out[i * 2] = x * sx + tx;
        out[i * 2 + 1] = y * sy + ty;
      } else {
        out[i * 2] = point[0];
        out[i * 2 + 1] = point[1];
      }
    });
    return out;
  });
}

/**
 * One closed ring from a list of arc indices. A negative index (~i) means arc i walked backwards.
 * @param {Float64Array[]} arcs decoded arcs
 * @param {number[]} indices
 * @returns {Float64Array}
 */
export function ringFromArcs(arcs, indices) {
  let count = 0;
  for (const index of indices) count += arcs[index < 0 ? ~index : index].length / 2;
  count -= indices.length - 1; // each arc starts where the previous one ended
  const ring = new Float64Array(Math.max(count, 0) * 2);
  let at = 0;
  indices.forEach((index, n) => {
    const reversed = index < 0;
    const arc = arcs[reversed ? ~index : index];
    const points = arc.length / 2;
    for (let k = n === 0 ? 0 : 1; k < points; k++) {
      const p = reversed ? points - 1 - k : k;
      ring[at++] = arc[p * 2];
      ring[at++] = arc[p * 2 + 1];
    }
  });
  return ring;
}

/** @param {Float64Array[]} arcs @param {TopoGeometry} geometry @returns {Polygon[]} */
export function polygonsOf(arcs, geometry) {
  if (geometry.type === 'Polygon') return [geometry.arcs.map((/** @type {number[]} */ ring) => ringFromArcs(arcs, ring))];
  if (geometry.type === 'MultiPolygon') return geometry.arcs.map((/** @type {number[][]} */ polygon) => polygon.map((ring) => ringFromArcs(arcs, ring)));
  return [];
}

/**
 * Every feature of one object (for example "regions" or "context"), with real coordinates.
 * @param {Topology} topology
 * @param {string} objectName
 * @param {Float64Array[]} [decoded] pass the result of decodeArcs() to share it between calls
 * @returns {MapFeature[]}
 */
export function featuresOf(topology, objectName, decoded = decodeArcs(topology)) {
  const object = topology.objects[objectName];
  if (!object?.geometries) throw new Error(`The map has no object "${objectName}"`);
  return object.geometries.map((geometry) => ({ properties: geometry.properties ?? {}, polygons: polygonsOf(decoded, geometry) }));
}

/** The arc indices (always the non-negative form) a geometry uses. @param {TopoGeometry} geometry @returns {number[]} */
export function arcsUsedBy(geometry) {
  /** @type {number[]} */
  const used = [];
  const walk = (/** @type {any} */ node) => {
    if (typeof node === 'number') used.push(node < 0 ? ~node : node);
    else for (const child of node) walk(child);
  };
  if (geometry.arcs) walk(geometry.arcs);
  return used;
}
