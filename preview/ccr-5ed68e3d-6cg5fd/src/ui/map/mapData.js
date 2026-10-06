// Turns the map files (TopoJSON, kilometres) into what the view needs: shapes in WORLD units (the
// pixels of the most detailed baked texture, y down), which arcs are coastline, region borders or
// country borders, how the countries touch, and where their labels go. Pure, so it is tested.
// There are two files: the theater (the 16 playable countries, in detail) and, optionally, the rest
// of the world in grey (tools/build-world.mjs). Both are Mercator kilometres, so they line up.

import { boxOf, longerSide } from './box.js';
import { colorGraph } from './coloring.js';
import { arcsUsedBy, decodeArcs, featuresOf } from './topology.js';

/** Width in world units of the theater; also the pixel width of the sharpest baked texture. */
export const WORLD_WIDTH = 3072;

/**
 * Arc kinds: used by one region (a coast, or the frontier with the grey neighbours), by two regions of
 * one country, by two countries, by no region at all (only the grey neighbours: they are outlined with
 * their own light stroke), or lying along the edge of the theater's box, where the grey neighbours were
 * cut off and nothing may be drawn (the world continues beyond it).
 */
export const ARC = { OUTER: 0, REGION: 1, BORDER: 2, CONTEXT: 3, EDGE: 4 };

/**
 * @typedef {import('./topology.js').Polygon} Polygon
 * @typedef {import('./box.js').Box} Box
 * @typedef {{ id: string, country: string, polygons: Polygon[], box: Box, label: [number, number], area: number }} MapRegion
 * @typedef {{ id: string, polygons: Polygon[], box: Box, label: [number, number], regions: string[] }} MapCountry
 * @typedef {{ id: string, name: string, polygons: Polygon[], box: Box, focus: Box, size: number, label: [number, number] }} WorldCountry
 *   `focus` is the box of the largest polygon (the mainland, not the far islands) and `size` its longer side
 * @typedef {{ rect: Box, countries: WorldCountry[], byId: Map<string, WorldCountry> }} WorldGeometry
 * @typedef {{
 *   width: number, height: number, theater: Box, world: WorldGeometry | null,
 *   regions: MapRegion[], countries: MapCountry[], context: Array<{ id: string, polygons: Polygon[] }>,
 *   arcs: Float64Array[], arcKind: Uint8Array,
 *   countryNeighbours: Map<string, Set<string>>, colorOf: Map<string, number>,
 * }} MapGeometry
 */

/** @param {Polygon[]} polygons Unsigned exterior area (holes ignored), good enough to rank regions. */
function areaOf(polygons) {
  let total = 0;
  for (const polygon of polygons) {
    const ring = polygon[0];
    let sum = 0;
    for (let i = 2; i < ring.length; i += 2) sum += ring[i - 2] * ring[i + 1] - ring[i] * ring[i - 1];
    total += Math.abs(sum) / 2;
  }
  return total;
}

/** True when every point of the arc lies on one side of the theater's box (within half a unit). @param {Float64Array} arc @param {number} width @param {number} height */
function alongBoxEdge(arc, width, height) {
  const on = (/** @type {number} */ offset, /** @type {number} */ edge) => {
    for (let i = offset; i < arc.length; i += 2) if (Math.abs(arc[i] - edge) > 0.5) return false;
    return true;
  };
  return on(0, 0) || on(0, width) || on(1, 0) || on(1, height);
}

/** @param {Polygon[]} polygons the polygon with the largest exterior ring */
function largestPolygon(polygons) {
  return polygons.reduce((a, b) => (areaOf([b]) > areaOf([a]) ? b : a));
}

/**
 * The grey rest of the world, in the theater's world units.
 * @param {import('./topology.js').Topology & { gs: any }} worldTopology
 * @param {(p: number[]) => number[]} toWorld kilometres to world units
 * @returns {WorldGeometry}
 */
function buildWorld(worldTopology, toWorld) {
  const [wx0, wy0, wx1, wy1] = worldTopology.gs.box;
  const [minX, minY] = toWorld([wx0, wy1]); // the north-west corner
  const [maxX, maxY] = toWorld([wx1, wy0]); // the south-east corner
  const arcs = decodeArcs(worldTopology).map((arc) => {
    const out = new Float64Array(arc.length);
    for (let i = 0; i < arc.length; i += 2) [out[i], out[i + 1]] = toWorld([arc[i], arc[i + 1]]);
    return out;
  });
  const labels = worldTopology.gs.labels.countries;
  /** @type {WorldCountry[]} */
  const countries = [];
  for (const f of featuresOf(worldTopology, 'countries', arcs)) {
    if (f.polygons.length === 0) continue;
    const id = f.properties.id;
    const focus = boxOf([largestPolygon(f.polygons)]);
    const label = labels[id] ? /** @type {[number, number]} */ (toWorld(labels[id])) : /** @type {[number, number]} */ ([(focus.minX + focus.maxX) / 2, (focus.minY + focus.maxY) / 2]);
    countries.push({ id, name: f.properties.name, polygons: f.polygons, box: boxOf(f.polygons), focus, size: longerSide(focus), label });
  }
  return { rect: { minX, minY, maxX, maxY }, countries, byId: new Map(countries.map((c) => [c.id, c])) };
}

/**
 * @param {import('./topology.js').Topology & { gs?: any }} topology the theater
 * @param {(import('./topology.js').Topology & { gs?: any }) | null} [worldTopology] the grey rest of the world, or null for the theater alone
 * @param {number} [worldWidth]
 * @returns {MapGeometry}
 */
export function buildMapGeometry(topology, worldTopology = null, worldWidth = WORLD_WIDTH) {
  const [x0, y0, x1, y1] = topology.gs.box;
  const k = worldWidth / (x1 - x0);
  /** km (east, north) to world (right, down). */
  const toWorld = (/** @type {number[]} */ p) => [(p[0] - x0) * k, (y1 - p[1]) * k];

  const arcs = decodeArcs(topology).map((arc) => {
    const out = new Float64Array(arc.length);
    for (let i = 0; i < arc.length; i += 2) [out[i], out[i + 1]] = toWorld([arc[i], arc[i + 1]]);
    return out;
  });
  const labels = topology.gs.labels;
  const labelAt = (/** @type {string} */ kind, /** @type {string} */ id) => /** @type {[number, number]} */ (toWorld(labels[kind][id]));

  const regions = featuresOf(topology, 'regions', arcs).map((f) => {
    const id = f.properties.region;
    return { id, country: f.properties.country, polygons: f.polygons, box: boxOf(f.polygons), label: labelAt('regions', id), area: areaOf(f.polygons) };
  });
  const regionsOf = new Map(regions.map((r) => [r.id, r]));
  /** @type {Map<string, string[]>} */
  const byCountry = new Map();
  for (const region of regions) byCountry.set(region.country, [...(byCountry.get(region.country) ?? []), region.id]);
  const countries = featuresOf(topology, 'countries', arcs).map((f) => {
    const id = f.properties.country;
    return { id, polygons: f.polygons, box: boxOf(f.polygons), label: labelAt('countries', id), regions: byCountry.get(id) ?? [] };
  });
  const context = featuresOf(topology, 'context', arcs).map((f) => ({ id: f.properties.id, polygons: f.polygons }));

  // Which regions use each arc decides how it is drawn, and which countries touch.
  /** @type {Map<number, string[]>} */
  const users = new Map();
  for (const geometry of topology.objects.regions.geometries ?? []) {
    for (const arc of new Set(arcsUsedBy(geometry))) users.set(arc, [...(users.get(arc) ?? []), geometry.properties?.region]);
  }
  const arcKind = new Uint8Array(arcs.length).fill(ARC.CONTEXT);
  /** @type {Map<string, Set<string>>} */
  const countryNeighbours = new Map(countries.map((c) => [c.id, new Set()]));
  for (const [arc, ids] of users) {
    if (ids.length < 2) {
      arcKind[arc] = ARC.OUTER;
      continue;
    }
    const owners = new Set(ids.map((id) => regionsOf.get(id)?.country));
    arcKind[arc] = owners.size > 1 ? ARC.BORDER : ARC.REGION;
    for (const a of owners) for (const b of owners) if (a && b && a !== b) countryNeighbours.get(a)?.add(b);
  }
  const height = (y1 - y0) * k;
  arcs.forEach((arc, index) => {
    if (arcKind[index] === ARC.CONTEXT && alongBoxEdge(arc, worldWidth, height)) arcKind[index] = ARC.EDGE;
  });
  const colorOf = colorGraph(countries.map((c) => c.id), countryNeighbours);

  const world = worldTopology ? buildWorld(/** @type {any} */ (worldTopology), toWorld) : null;
  return { width: worldWidth, height, theater: { minX: 0, minY: 0, maxX: worldWidth, maxY: height }, world, regions, countries, context, arcs, arcKind, countryNeighbours, colorOf };
}
