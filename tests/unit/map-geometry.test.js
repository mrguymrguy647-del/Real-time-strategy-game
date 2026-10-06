// The map build's pure geometry: projection, grouping admin-1 units into regions, area, centroid,
// neighbours and the size class. Plus the whole pipeline on a tiny synthetic map (no network).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopology } from '../../tools/build-map.mjs';
import { WORLD, buildWorldTopology, worldBox } from '../../tools/build-world.mjs';
import { areaAndCentroid, assignRegions, deriveRegionFacts, inverseMercator, mercator, neighboursFromArcs, projectCoordinates, realAreaKm2, ringArea, sizeClass, touchesBox } from '../../tools/lib/mapGeometry.mjs';
import { arcsUsedBy, decodeArcs, featuresOf } from '../../src/ui/map/topology.js';

const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

describe('Mercator', () => {
  it('maps the equator and prime meridian to the origin', () => {
    const [x, y] = mercator(0, 0);
    close(x, 0);
    close(y, 0);
  });

  it('round-trips longitude and latitude', () => {
    for (const [lon, lat] of [[24, 12], [47.8, 30.5], [60, 42], [-10, 5]]) {
      const [x, y] = mercator(lon, lat);
      const [lon2, lat2] = inverseMercator(x, y);
      close(lon2, lon, 1e-9);
      close(lat2, lat, 1e-9);
    }
  });

  it('projects nested GeoJSON coordinates, keeping their shape', () => {
    const out = projectCoordinates([[[0, 0], [1, 0], [1, 1], [0, 0]]]);
    assert.equal(out.length, 1);
    assert.equal(out[0].length, 4);
    close(out[0][1][0], mercator(1, 0)[0]);
  });

  it('has one degree of longitude about 111 km at the equator, and stretches north', () => {
    close(mercator(1, 0)[0], 111.319, 0.01);
    assert.ok(mercator(0, 40)[1] > 40 * 111.2, 'northward distances are stretched');
  });
});

describe('touchesBox', () => {
  it('finds a geometry with any point inside the lon/lat box', () => {
    const geometry = { type: 'Polygon', coordinates: [[[100, 0], [101, 0], [30, 30], [100, 0]]] };
    assert.equal(touchesBox(geometry, [24, 11, 64, 43]), true);
    assert.equal(touchesBox({ type: 'Polygon', coordinates: [[[100, 0], [101, 0], [101, 1], [100, 0]]] }, [24, 11, 64, 43]), false);
  });
});

describe('assignRegions', () => {
  const groups = { countries: ['AAA'], regions: { 'AAA-north': ['Alpha', 'Beta'], 'AAA-south': ['Gamma', 'AA-X01~'] } };
  const unit = (/** @type {string} */ name, /** @type {string} */ iso = 'AA-00', /** @type {string} */ adm0 = 'AAA') => ({ properties: { adm0_a3: adm0, name, iso_3166_2: iso }, geometry: { type: 'Polygon', coordinates: [] } });

  it('gives each unit the region it is listed under, matching by name or by iso code', () => {
    const { features, problems } = assignRegions(groups, [unit('Alpha'), unit('Beta'), unit('Gamma'), unit('Neutral Zone', 'AA-X01~'), unit('Elsewhere', 'ZZ-1', 'ZZZ')]);
    assert.deepEqual(problems, []);
    assert.deepEqual(features.map((f) => f.properties.region), ['AAA-north', 'AAA-north', 'AAA-south', 'AAA-south']);
    assert.deepEqual(features.map((f) => f.properties.country), ['AAA', 'AAA', 'AAA', 'AAA']);
  });

  it('reports a unit nobody listed, and a listed unit that does not exist', () => {
    const { problems } = assignRegions(groups, [unit('Alpha'), unit('Beta'), unit('Gamma'), unit('Surprise')]);
    assert.ok(problems.some((p) => /unmapped.*Surprise/.test(p)), problems.join('\n'));
    assert.ok(problems.some((p) => /not found.*AA-X01~/.test(p)), problems.join('\n'));
  });

  it('reports a unit listed in two regions', () => {
    const twice = { countries: ['AAA'], regions: { 'AAA-a': ['Alpha'], 'AAA-b': ['Alpha'] } };
    assert.ok(assignRegions(twice, [unit('Alpha')]).problems.some((p) => /two regions/.test(p)));
  });
});

describe('area, centroid and size', () => {
  const square = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) => new Float64Array([x, y, x + s, y, x + s, y + s, x, y + s, x, y]);

  it('computes a ring area from the shoelace formula', () => {
    close(Math.abs(ringArea(square(0, 0, 10))), 100);
  });

  it('subtracts holes and finds the centroid of the outer ring', () => {
    const { area, centroid } = areaAndCentroid([[square(0, 0, 10), square(2, 2, 2)]]);
    close(area, 96);
    close(centroid[0], 5, 1e-9);
    close(centroid[1], 5, 1e-9);
  });

  it('weights several polygons by their area', () => {
    const { centroid } = areaAndCentroid([[square(0, 0, 2)], [square(10, 0, 2)]]);
    close(centroid[0], 6, 1e-9);
  });

  it('turns Mercator area back into real area (smaller away from the equator)', () => {
    close(realAreaKm2(1000, 0), 1000);
    assert.ok(realAreaKm2(1000, 60) < 300);
  });

  it('classes size from 1 (a city-state) to 5 (a huge desert region)', () => {
    assert.deepEqual([700, 5000, 30_000, 120_000, 570_000].map(sizeClass), [1, 2, 3, 4, 5]);
  });
});

describe('the pipeline on a synthetic map', async () => {
  // Three regions: A and B share an edge, C is across a gap. A grey neighbour sits to the east.
  const km = (/** @type {number[][][]} */ ring) => ring;
  const feature = (/** @type {Record<string, string>} */ properties, /** @type {number[][]} */ ring) => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: km([ring]) } });
  const rect = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const topology = await buildTopology({
    regionFeatures: [
      feature({ region: 'AAA-west', country: 'AAA' }, rect(0, 0, 100, 100)),
      feature({ region: 'AAA-east', country: 'AAA' }, rect(100, 0, 200, 100)),
      feature({ region: 'BBB-far', country: 'BBB' }, rect(400, 0, 500, 100)),
    ],
    contextFeatures: [feature({ id: 'CCC' }, rect(200, -50, 900, 150))],
    box: [-50, -50, 600, 200],
    simplify: { regions: '100%', context: '100%' },
    quantization: 4000,
  });

  it('keeps one geometry per region and clips the grey neighbour to the box', () => {
    assert.deepEqual(topology.objects.regions.geometries?.map((g) => g.properties?.region).sort(), ['AAA-east', 'AAA-west', 'BBB-far']);
    const [context] = featuresOf(topology, 'context');
    const xs = context.polygons[0][0].filter((_, i) => i % 2 === 0);
    assert.ok(Math.max(...xs) <= 600.5, 'clipped at the box edge');
  });

  it('stores a shared border once, so neighbours are found from shared arcs', () => {
    const neighbours = neighboursFromArcs(topology, 'regions', 'region');
    assert.deepEqual([...(neighbours.get('AAA-west') ?? [])], ['AAA-east']);
    assert.deepEqual([...(neighbours.get('BBB-far') ?? [])], []);
  });

  it('derives sorted, symmetric neighbour lists and a size for every region', () => {
    const facts = deriveRegionFacts(topology);
    assert.deepEqual(facts['AAA-east'].neighbors, ['AAA-west']);
    assert.deepEqual(facts['AAA-west'].neighbors, ['AAA-east']);
    close(facts['BBB-far'].areaKm2, 10_000, 5); // a 100 km x 100 km square on the equator
    assert.equal(facts['BBB-far'].size, 2);
    assert.equal(decodeArcs(topology).length, topology.arcs.length);
  });
});

describe('the grey world', async () => {
  const square = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
  const feature = (/** @type {string} */ id, /** @type {any} */ geometry) => ({ type: 'Feature', properties: { id, name: `Land ${id}` }, geometry });
  // Two ordinary countries, one that straddles the northern limit, and one at the South Pole (Mercator is infinite there).
  const topology = await buildWorldTopology({
    features: [feature('AAA', square(10, 10, 20, 20)), feature('BBB', square(20, 10, 30, 20)), feature('NNN', square(0, 70, 10, 85)), feature('SSS', square(-180, -90, 180, -70))],
    simplify: '100%',
  });
  const decoded = decodeArcs(topology);
  const countries = featuresOf(topology, 'countries', decoded);

  it('drops what lies wholly beyond the latitudes shown, without projecting the pole', () => {
    assert.deepEqual(countries.map((f) => f.properties.id).sort(), ['AAA', 'BBB', 'NNN']);
  });

  it('keeps the properties and clips what straddles the limit', () => {
    assert.equal(countries.find((f) => f.properties.id === 'AAA')?.properties.name, 'Land AAA');
    const [, y0, , y1] = worldBox();
    for (const f of countries) for (const polygon of f.polygons) for (const ring of polygon) {
      for (let i = 0; i < ring.length; i += 2) {
        assert.ok(Number.isFinite(ring[i]) && Number.isFinite(ring[i + 1]), 'finite coordinates');
        assert.ok(ring[i + 1] >= y0 - 1 && ring[i + 1] <= y1 + 1, `latitude inside the box: ${ring[i + 1]}`);
      }
    }
    const north = countries.find((f) => f.properties.id === 'NNN');
    const top = Math.max(...north.polygons[0][0].filter((_, i) => i % 2 === 1));
    close(top, mercator(0, WORLD.latitudes[1])[1], 0.5);
  });

  it('shares a border once between neighbours', () => {
    const owners = new Map();
    for (const geometry of topology.objects.countries.geometries ?? []) for (const arc of arcsUsedBy(geometry)) owners.set(arc, (owners.get(arc) ?? 0) + 1);
    assert.ok([...owners.values()].some((n) => n === 2), 'AAA and BBB touch along one arc');
  });

  it('has a box that is the whole width of the earth and the chosen latitudes', () => {
    const [x0, y0, x1, y1] = worldBox();
    close(x1 - x0, 2 * Math.PI * 6378.137, 0.01);
    assert.ok(y0 < 0 && y1 > 0);
    close(inverseMercator(0, y0)[1], WORLD.latitudes[0], 1e-6);
    close(inverseMercator(0, y1)[1], WORLD.latitudes[1], 1e-6);
  });
});
