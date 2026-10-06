// Turns the map file (TopoJSON, kilometres) into what the view needs: shapes in WORLD units (the
// pixels of the most detailed baked texture, y down), which arcs are coastline, region borders or
// country borders, how the countries touch, and where their labels go. Pure, so it is tested.

import { colorGraph } from './coloring.js';
import { arcsUsedBy, decodeArcs, featuresOf } from './topology.js';

/** Width in world units of the whole map; also the pixel width of the sharpest baked texture. */
export const WORLD_WIDTH = 3072;

/**
 * Arc kinds: used by one region (a coast, or the frontier with the grey neighbours), by two regions of
 * one country, by two countries, or by no region at all (only the grey neighbours: they are outlined
 * with their own light stroke, and the edge of the map must not get a coast line).
 */
export const ARC = { OUTER: 0, REGION: 1, BORDER: 2, CONTEXT: 3 };

/**
 * @typedef {import('./topology.js').Polygon} Polygon
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Box
 * @typedef {{ id: string, country: string, polygons: Polygon[], box: Box, label: [number, number], area: number }} MapRegion
 * @typedef {{ id: string, polygons: Polygon[], box: Box, label: [number, number], regions: string[] }} MapCountry
 * @typedef {{
 *   width: number, height: number,
 *   regions: MapRegion[], countries: MapCountry[], context: Array<{ id: string, polygons: Polygon[] }>,
 *   arcs: Float64Array[], arcKind: Uint8Array,
 *   countryNeighbours: Map<string, Set<string>>, colorOf: Map<string, number>,
 * }} MapGeometry
 */

/** @param {Polygon[]} polygons @returns {Box} */
function boxOf(polygons) {
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

/**
 * @param {import('./topology.js').Topology & { gs?: any }} topology
 * @param {number} [worldWidth]
 * @returns {MapGeometry}
 */
export function buildMapGeometry(topology, worldWidth = WORLD_WIDTH) {
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
  const colorOf = colorGraph(countries.map((c) => c.id), countryNeighbours);

  return { width: worldWidth, height: (y1 - y0) * k, regions, countries, context, arcs, arcKind, countryNeighbours, colorOf };
}
