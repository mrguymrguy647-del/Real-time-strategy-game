// Build the grey rest-of-the-world backdrop (ARCHITECTURE §9.7): every Natural Earth country except the
// playable ones, as one TopoJSON in the same Mercator kilometres as the theater file, so the two line up.
// It is only a picture and a name to tap: these countries are NOT in data/countries.json and never enter
// the simulation (that is Phase 5). The whole world is clipped to latitudes the map can show, in lon/lat
// *before* projecting, because Mercator is infinite at the poles and Antarctica would project to garbage.
//
//   npm run build:map              builds the theater and then this (needs the Natural Earth cache)
//   npm run build:map -- --only world    just this file

import mapshaper from 'mapshaper';
import { labelPoints, mercator, projectCoordinates } from './lib/mapGeometry.mjs';
import { decodeArcs } from '../src/ui/map/topology.js';

/**
 * Latitudes shown (south, north): Antarctica is below -58 and the polar cap above 80 holds almost no one.
 * Simplification: a world backdrop needs about 10 km of detail, so 2% of the 10 m source keeps coasts
 * recognisable at about 120 KB. The quantization grid is 2 km over the 40,000 km width.
 */
/** Countries smaller than this (in Mercator square kilometres) are left out. */
const MIN_AREA_KM2 = 1;

export const WORLD = { latitudes: /** @type {[number, number]} */ ([-58, 80]), simplify: '2%', quantization: 20_000 };

/**
 * @param {{ features: any[], latitudes?: [number, number], simplify?: string, quantization?: number }} options
 *   features are lon/lat GeoJSON with properties { id, name }
 * @returns {Promise<import('../src/ui/map/topology.js').Topology>}
 */
export async function buildWorldTopology({ features, latitudes = WORLD.latitudes, simplify = WORLD.simplify, quantization = WORLD.quantization }) {
  const [south, north] = latitudes;
  const clipped = await mapshaper.applyCommands(
    `-i world.json name=countries -clip bbox=-180,${south},180,${north} -o clipped.json format=geojson`,
    { 'world.json': JSON.stringify({ type: 'FeatureCollection', features }) },
  );
  const kept = JSON.parse(clipped['clipped.json'].toString()).features.filter((/** @type {any} */ f) => f.geometry);
  const projected = kept.map((/** @type {any} */ f) => ({ ...f, geometry: { type: f.geometry.type, coordinates: projectCoordinates(f.geometry.coordinates) } }));
  // A country under a square kilometre (the Vatican) would be a dot with no inside to put a name in.
  const out = await mapshaper.applyCommands(
    `-i world.json name=countries -filter '$.area >= ${MIN_AREA_KM2}' -simplify visvalingam weighted ${simplify} keep-shapes -o out.topo.json format=topojson quantization=${quantization}`,
    { 'world.json': JSON.stringify({ type: 'FeatureCollection', features: projected }) },
  );
  const topology = JSON.parse(out['out.topo.json'].toString());
  // Simplifying can leave a speck of reef with no shape at all; it has nothing to draw or tap.
  const countries = topology.objects.countries;
  countries.geometries = (countries.geometries ?? []).filter((/** @type {{ type: string | null }} */ g) => g.type);
  return topology;
}

/** The clip box in map units (km). @param {[number, number]} [latitudes] @returns {[number, number, number, number]} */
export function worldBox(latitudes = WORLD.latitudes) {
  const [x0, y0] = mercator(-180, latitudes[0]);
  const [x1, y1] = mercator(180, latitudes[1]);
  return [x0, y0, x1, y1];
}

/**
 * @param {{ admin0: any, playable: string[], commit: string, theater: string }} source
 * @returns {Promise<{ document: any, countries: number, vertices: number }>}
 */
export async function buildWorld({ admin0, playable, commit, theater }) {
  const features = admin0.features
    .filter((/** @type {any} */ f) => !playable.includes(f.properties.ADM0_A3) && f.geometry)
    .map((/** @type {any} */ f) => ({ type: 'Feature', properties: { id: f.properties.ADM0_A3, name: f.properties.NAME }, geometry: f.geometry }));
  const topology = await buildWorldTopology({ features });
  const decoded = decodeArcs(topology);
  const labels = labelPoints(topology, 'countries', 'id', decoded);
  const box = worldBox().map((n) => Math.round(n * 10) / 10);
  const document = { ...topology, gs: { theater, units: 'km', projection: 'mercator', box, latitudes: WORLD.latitudes, naturalEarth: commit, labels: { countries: labels } } };
  return { document, countries: topology.objects.countries.geometries?.length ?? 0, vertices: decoded.reduce((n, arc) => n + arc.length / 2, 0) };
}
