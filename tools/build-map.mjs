// Build the map geometry and the generated fields of data/regions.json (ARCHITECTURE §9.1).
//
//   npm run build:map          downloads Natural Earth into .cache/ the first time (needs curl)
//
// Natural Earth admin-1 units are grouped into game regions by tools/map/<theater>.groups.json,
// projected to Mercator kilometres, dissolved, cleaned and simplified with mapshaper, and written as
// TopoJSON (shared borders stored once) to data/map/<theater>.topo.json. Then the fields that come
// from geometry (neighbours, centre point, size) are written into data/regions.json; every field
// that is edited by hand is left exactly as it is.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mapshaper from 'mapshaper';
import { assignRegions, deriveLabels, deriveRegionFacts, mercator, projectCoordinates, touchesBox } from './lib/mapGeometry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** How much detail survives: the playable regions keep 40% of their vertices, the grey neighbours 8%. */
export const SIMPLIFY = { regions: '40%', context: '8%' };
/** The TopoJSON coordinate grid: 12,000 steps over about 4,500 km is 0.4 km per step. */
export const QUANTIZATION = 12_000;
const FILES = { admin1: 'ne_10m_admin_1_states_provinces.geojson', admin0: 'ne_10m_admin_0_countries.geojson' };

/** @param {string} commit @param {string} cacheDir @returns {{ admin1: any, admin0: any }} */
function loadNaturalEarth(commit, cacheDir) {
  const dir = path.join(cacheDir, commit);
  fs.mkdirSync(dir, { recursive: true });
  /** @type {Record<string, any>} */
  const loaded = {};
  for (const [key, name] of Object.entries(FILES)) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/${name}`;
      console.log(`Downloading ${name} (Natural Earth ${commit.slice(0, 7)}) ...`);
      execFileSync('curl', ['-fsSL', '--retry', '3', '-o', `${file}.part`, url], { stdio: 'inherit' });
      fs.renameSync(`${file}.part`, file);
    }
    loaded[key] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return /** @type {{ admin1: any, admin0: any }} */ (loaded);
}

/**
 * Dissolve, clean, simplify and quantize into one TopoJSON with three objects: "regions" (the playable
 * land, one geometry per region), "countries" (the same land, one geometry per country, sharing the
 * regions' arcs) and "context" (grey neighbours, clipped to the box).
 * @param {{ regionFeatures: any[], contextFeatures: any[], box: number[], simplify?: { regions: string, context: string }, quantization?: number }} options
 *   features are GeoJSON in map units; `box` is the clip box [x0, y0, x1, y1] in map units
 * @returns {Promise<import('../src/ui/map/topology.js').Topology>}
 */
export async function buildTopology({ regionFeatures, contextFeatures, box, simplify = SIMPLIFY, quantization = QUANTIZATION }) {
  const input = {
    'regions.json': JSON.stringify({ type: 'FeatureCollection', features: regionFeatures }),
    'context.json': JSON.stringify({ type: 'FeatureCollection', features: contextFeatures }),
  };
  const commands = [
    '-i regions.json name=regions',
    '-dissolve2 region copy-fields=country',
    '-clean',
    '-dissolve country + name=countries',
    '-i context.json name=context',
    `-clip bbox=${box.join(',')} target=context`,
    `-simplify visvalingam weighted ${simplify.regions} keep-shapes target=regions,countries`,
    `-simplify visvalingam weighted ${simplify.context} keep-shapes target=context`,
    `-o out.topo.json format=topojson quantization=${quantization} target=*`,
  ].join(' ');
  const output = await mapshaper.applyCommands(commands, input);
  return JSON.parse(output['out.topo.json'].toString());
}

const isPrimitive = (/** @type {any} */ v) => v === null || typeof v !== 'object';
/** A value that fits on one line: a plain value, a list of plain values, or an object of plain values. @param {any} v */
const isSimple = (v) => isPrimitive(v) || (Array.isArray(v) ? v.every(isPrimitive) : Object.values(v).every(isPrimitive));

/** @param {any} v @returns {string} */
function oneLine(v) {
  if (isPrimitive(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(oneLine).join(', ')}]`;
  const entries = Object.entries(v);
  return entries.length === 0 ? '{}' : `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${oneLine(x)}`).join(', ')} }`;
}

/** @param {any} v @param {string} indent @returns {string} */
function layout(v, indent) {
  if (isSimple(v)) {
    const line = oneLine(v);
    if (isPrimitive(v) || indent.length + line.length <= 110) return line;
  }
  const inner = `${indent}  `;
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + layout(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${layout(x, inner)}`).join(',\n')}\n${indent}}`;
}

/** Readable JSON for hand-edited data: short plain lists and small flat objects stay on one line. @param {unknown} value */
export function formatJson(value) {
  return `${layout(value, '')}\n`;
}

/** The skeleton of a region that is not in data/regions.json yet, to be edited by hand. @param {string} id @param {string} theater */
function skeleton(id, theater) {
  const [country, ...slug] = id.split('-');
  const name = slug.join('-').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return { id, name, country, theater, terrain: 'plains', infrastructure: 3 };
}

/**
 * Write the generated fields into regions.json and keep everything else.
 * @param {string} file @param {string} theater @param {string[]} ids region ids in file order
 * @param {Record<string, any>} facts from deriveRegionFacts()
 * @returns {{ added: string[], removed: string[] }}
 */
function updateRegionsFile(file, theater, ids, facts) {
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { schema: 'regions', version: 1, items: [] };
  /** @type {Map<string, any>} */
  const existing = new Map(doc.items.map((/** @type {any} */ item) => [item.id, item]));
  const added = ids.filter((id) => !existing.has(id));
  const removed = [...existing.keys()].filter((id) => !ids.includes(id) && existing.get(id).theater === theater);
  doc.items = ids.map((id) => {
    const item = existing.get(id) ?? skeleton(id, theater);
    const fact = facts[id];
    // Generated fields. `size` is generated but may be edited by hand, so it is only filled in when missing.
    return { ...item, neighbors: fact.neighbors, size: item.size ?? fact.size, lonlat: fact.lonlat };
  });
  fs.writeFileSync(file, formatJson(doc));
  return { added, removed };
}

export async function main() {
  const groups = JSON.parse(fs.readFileSync(path.join(root, 'tools/map/middle_east.groups.json'), 'utf8'));
  const ne = loadNaturalEarth(groups.naturalEarthCommit, path.join(root, '.cache/natural-earth'));

  const { features, problems } = assignRegions(groups, ne.admin1.features);
  if (problems.length > 0) throw new Error(`The region grouping does not match Natural Earth:\n- ${problems.join('\n- ')}`);

  const [west, south, east, north] = groups.bbox;
  const [x0, y0] = mercator(west, south);
  const [x1, y1] = mercator(east, north);
  const regionFeatures = features.map((f) => ({ ...f, geometry: { type: f.geometry.type, coordinates: projectCoordinates(f.geometry.coordinates) } }));
  const contextFeatures = ne.admin0.features
    .filter((f) => !groups.countries.includes(f.properties.ADM0_A3) && touchesBox(f.geometry, groups.bbox))
    .map((f) => ({ type: 'Feature', properties: { id: f.properties.ADM0_A3 }, geometry: { type: f.geometry.type, coordinates: projectCoordinates(f.geometry.coordinates) } }));

  const topology = await buildTopology({ regionFeatures, contextFeatures, box: [x0, y0, x1, y1] });
  const ids = Object.keys(groups.regions);
  const have = new Set(topology.objects.regions.geometries?.map((g) => g.properties?.region));
  const lost = ids.filter((id) => !have.has(id));
  if (lost.length > 0) throw new Error(`These regions have no geometry after simplification: ${lost.join(', ')}`);

  const out = path.join(root, `data/map/${groups.theater}.topo.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const box = [x0, y0, x1, y1].map((n) => Math.round(n * 10) / 10);
  const labels = deriveLabels(topology);
  const document = { ...topology, gs: { theater: groups.theater, units: 'km', projection: 'mercator', box, naturalEarth: groups.naturalEarthCommit, labels } };
  fs.writeFileSync(out, JSON.stringify(document));

  const facts = deriveRegionFacts(topology);
  const { added, removed } = updateRegionsFile(path.join(root, 'data/regions.json'), groups.theater, ids, facts);
  if (removed.length > 0) console.warn(`data/regions.json still has regions that are not in the grouping file: ${removed.join(', ')}`);
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  const vertices = topology.arcs.reduce((n, arc) => n + arc.length, 0);
  console.log(`Wrote ${path.relative(root, out)}: ${kb} KB, ${ids.length} regions, ${topology.arcs.length} arcs, ${vertices} vertices.`);
  console.log(`Updated data/regions.json: ${added.length} new region(s) need a name, terrain and infrastructure.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
