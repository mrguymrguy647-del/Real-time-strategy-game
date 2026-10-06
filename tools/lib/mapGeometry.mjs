// Pure geometry helpers for tools/build-map.mjs: Mercator, grouping Natural Earth units into game
// regions, and the numbers derived from the finished topology (area, centroid, neighbours, size).
// Map units are kilometres in Mercator, x east and y north (the same as src/ui/map/topology.js).

import { poleOfInaccessibility } from '../../src/ui/map/labels.js';
import { arcsUsedBy, decodeArcs, featuresOf } from '../../src/ui/map/topology.js';

const EARTH_RADIUS_KM = 6378.137;
const RAD = Math.PI / 180;

/** @param {number} lon @param {number} lat @returns {[number, number]} map units (km) */
export const mercator = (lon, lat) => [EARTH_RADIUS_KM * lon * RAD, EARTH_RADIUS_KM * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))];

/** @param {number} x @param {number} y @returns {[number, number]} [lon, lat] */
export const inverseMercator = (x, y) => [(x / EARTH_RADIUS_KM) / RAD, (2 * Math.atan(Math.exp(y / EARTH_RADIUS_KM)) - Math.PI / 2) / RAD];

/** Project GeoJSON coordinates (any nesting) from lon/lat to map units. @param {any} coords @returns {any} */
export function projectCoordinates(coords) {
  return typeof coords[0] === 'number' ? mercator(coords[0], coords[1]) : coords.map(projectCoordinates);
}

/** True when any point of a GeoJSON geometry lies in the lon/lat box [west, south, east, north]. @param {any} geometry @param {number[]} box */
export function touchesBox(geometry, box) {
  let hit = false;
  const walk = (/** @type {any} */ c) => {
    if (hit) return;
    if (typeof c[0] === 'number') hit = c[0] >= box[0] && c[0] <= box[2] && c[1] >= box[1] && c[1] <= box[3];
    else for (const child of c) walk(child);
  };
  walk(geometry.coordinates);
  return hit;
}

/**
 * Give every Natural Earth admin-1 unit of the theater its game region. Units are matched inside
 * their country by `name`, or by `iso_3166_2` where a name repeats. Anything unmapped or mapped twice
 * is an error, so a Natural Earth update can never silently lose land.
 * @param {{ countries: string[], regions: Record<string, string[]> }} groups
 * @param {any[]} admin1 GeoJSON features
 * @returns {{ features: any[], problems: string[] }} features have properties { region, country }
 */
export function assignRegions(groups, admin1) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Map<string, string>} */
  const regionOf = new Map();
  for (const [region, units] of Object.entries(groups.regions)) {
    const country = region.split('-')[0];
    if (!groups.countries.includes(country)) problems.push(`${region}: its country ${country} is not in "countries"`);
    for (const unit of units) {
      const key = `${country}|${unit}`;
      if (regionOf.has(key)) problems.push(`${key} is listed in two regions (${regionOf.get(key)} and ${region})`);
      regionOf.set(key, region);
    }
  }
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {any[]} */
  const features = [];
  for (const feature of admin1) {
    const p = feature.properties;
    if (!groups.countries.includes(p.adm0_a3)) continue;
    const key = [`${p.adm0_a3}|${p.name}`, `${p.adm0_a3}|${p.iso_3166_2}`].find((k) => regionOf.has(k));
    if (!key) {
      problems.push(`unmapped Natural Earth unit: ${p.adm0_a3} "${p.name}" [${p.iso_3166_2}]`);
      continue;
    }
    used.add(key);
    features.push({ type: 'Feature', properties: { region: regionOf.get(key), country: p.adm0_a3 }, geometry: feature.geometry });
  }
  for (const key of regionOf.keys()) if (!used.has(key)) problems.push(`mapped unit not found in Natural Earth: ${key}`);
  return { features, problems };
}

/** Signed shoelace area of a ring (x,y pairs), in map units squared. @param {Float64Array} ring */
export function ringArea(ring) {
  let sum = 0;
  for (let i = 2; i < ring.length; i += 2) sum += ring[i - 2] * ring[i + 1] - ring[i] * ring[i - 1];
  return sum / 2;
}

/**
 * Area and centroid of a feature's polygons, in map units. Holes subtract; the centroid weights each
 * exterior ring by its area.
 * @param {import('../../src/ui/map/topology.js').Polygon[]} polygons
 * @returns {{ area: number, centroid: [number, number] }}
 */
export function areaAndCentroid(polygons) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (const polygon of polygons) {
    polygon.forEach((ring, index) => {
      const a = Math.abs(ringArea(ring));
      area += index === 0 ? a : -a;
      if (index !== 0) return;
      // centroid of the ring
      let rx = 0;
      let ry = 0;
      let twice = 0;
      for (let i = 2; i < ring.length; i += 2) {
        const cross = ring[i - 2] * ring[i + 1] - ring[i] * ring[i - 1];
        twice += cross;
        rx += (ring[i - 2] + ring[i]) * cross;
        ry += (ring[i - 1] + ring[i + 1]) * cross;
      }
      if (twice !== 0) {
        cx += (rx / (3 * twice)) * a;
        cy += (ry / (3 * twice)) * a;
      }
    });
  }
  const outer = polygons.reduce((sum, polygon) => sum + Math.abs(ringArea(polygon[0])), 0);
  return { area, centroid: outer > 0 ? [cx / outer, cy / outer] : [0, 0] };
}

/**
 * Real surface area in km² from a Mercator area at a given latitude (Mercator stretches area by 1/cos²).
 * @param {number} mercatorArea @param {number} lat degrees
 */
export const realAreaKm2 = (mercatorArea, lat) => mercatorArea * Math.cos(lat * RAD) ** 2;

/** Size class 1-5 from real area; "generated, editable" in DATA_SCHEMAS §5. @param {number} km2 @returns {1 | 2 | 3 | 4 | 5} */
export function sizeClass(km2) {
  if (km2 < 4000) return 1;
  if (km2 < 25_000) return 2;
  if (km2 < 90_000) return 3;
  if (km2 < 250_000) return 4;
  return 5;
}

/**
 * Which regions share a border: two geometries that use the same arc touch along it.
 * @param {import('../../src/ui/map/topology.js').Topology} topology
 * @param {string} objectName
 * @param {string} idField the property holding a geometry's id
 * @returns {Map<string, Set<string>>}
 */
export function neighboursFromArcs(topology, objectName, idField) {
  /** @type {Map<number, Set<string>>} */
  const users = new Map();
  /** @type {Map<string, Set<string>>} */
  const neighbours = new Map();
  for (const geometry of topology.objects[objectName].geometries ?? []) {
    const id = geometry.properties?.[idField];
    neighbours.set(id, new Set());
    for (const arc of arcsUsedBy(geometry)) {
      if (!users.has(arc)) users.set(arc, new Set());
      users.get(arc)?.add(id);
    }
  }
  for (const set of users.values()) {
    for (const a of set) for (const b of set) if (a !== b) neighbours.get(a)?.add(b);
  }
  return neighbours;
}

/**
 * Everything data/regions.json derives from the finished topology.
 * @param {import('../../src/ui/map/topology.js').Topology} topology
 * @returns {Record<string, { neighbors: string[], lonlat: [number, number], areaKm2: number, size: 1 | 2 | 3 | 4 | 5 }>}
 */
export function deriveRegionFacts(topology) {
  const decoded = decodeArcs(topology);
  const neighbours = neighboursFromArcs(topology, 'regions', 'region');
  /** @type {Record<string, any>} */
  const facts = {};
  for (const feature of featuresOf(topology, 'regions', decoded)) {
    const id = feature.properties.region;
    const { area, centroid } = areaAndCentroid(feature.polygons);
    const [lon, lat] = inverseMercator(centroid[0], centroid[1]);
    const areaKm2 = Math.round(realAreaKm2(area, lat));
    facts[id] = {
      neighbors: [...(neighbours.get(id) ?? [])].sort(),
      lonlat: [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100],
      areaKm2,
      size: sizeClass(areaKm2),
    };
  }
  return facts;
}

/**
 * Where to put each country's and region's label: the pole of inaccessibility of its largest polygon.
 * Computed here, once, so a phone never has to. Map units (km), rounded to 0.1.
 * @param {import('../../src/ui/map/topology.js').Topology} topology
 * @returns {{ countries: Record<string, [number, number]>, regions: Record<string, [number, number]> }}
 */
export function deriveLabels(topology) {
  const decoded = decodeArcs(topology);
  /** @param {string} objectName @param {string} idField */
  const pick = (objectName, idField) => {
    /** @type {Record<string, [number, number]>} */
    const labels = {};
    for (const feature of featuresOf(topology, objectName, decoded)) {
      const largest = feature.polygons.reduce((a, b) => (Math.abs(ringArea(b[0])) > Math.abs(ringArea(a[0])) ? b : a));
      const [x, y] = poleOfInaccessibility(largest, 1);
      labels[feature.properties[idField]] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    }
    return labels;
  };
  return { countries: pick('countries', 'country'), regions: pick('regions', 'region') };
}
