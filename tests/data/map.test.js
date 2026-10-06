// The committed map geometry and the region data must agree. These checks guard against a changed
// grouping file, a hand edit of a generated field, or a map that was never rebuilt (npm run build:map).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deriveRegionFacts } from '../../tools/lib/mapGeometry.mjs';
import { decodeArcs, featuresOf } from '../../src/ui/map/topology.js';
import { ROOT, readJsonFromDisk } from '../helpers/data.js';

const topologyFile = path.join(ROOT, 'data/map/middle_east.topo.json');
const topology = JSON.parse(fs.readFileSync(topologyFile, 'utf8'));
const regionsDoc = await readJsonFromDisk('data/regions.json');
const countriesDoc = await readJsonFromDisk('data/countries.json');
const groups = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/map/middle_east.groups.json'), 'utf8'));
const worldFile = path.join(ROOT, 'data/map/world.topo.json');
const worldTopology = JSON.parse(fs.readFileSync(worldFile, 'utf8'));
const decoded = decodeArcs(topology);
const regions = featuresOf(topology, 'regions', decoded);
const countryShapes = featuresOf(topology, 'countries', decoded);
const context = featuresOf(topology, 'context', decoded);

describe('the Middle East map geometry', () => {
  it('has exactly the regions of data/regions.json and of the grouping file', () => {
    const inMap = regions.map((f) => f.properties.region).sort();
    assert.deepEqual(inMap, regionsDoc.items.map((/** @type {any} */ r) => r.id).sort());
    assert.deepEqual(inMap, Object.keys(groups.regions).sort());
  });

  it('labels every region geometry with the country of its id', () => {
    for (const f of regions) assert.equal(f.properties.country, f.properties.region.split('-')[0], f.properties.region);
  });

  it('draws every region as closed rings with real area, and no region is a speck', () => {
    for (const f of regions) {
      assert.ok(f.polygons.length > 0, `${f.properties.region} has no polygon`);
      for (const polygon of f.polygons) {
        for (const ring of polygon) {
          assert.ok(ring.length >= 8, `${f.properties.region} has a ring with fewer than 4 points`);
          assert.deepEqual([ring[0], ring[1]], [ring[ring.length - 2], ring[ring.length - 1]], `${f.properties.region} has an open ring`);
        }
      }
    }
    // The smallest real region is Bahrain's capital area (about 60 km2); anything below 30 is a sliver.
    for (const [id, fact] of Object.entries(deriveRegionFacts(topology))) assert.ok(fact.areaKm2 >= 30, `${id} is only ${fact.areaKm2} km2`);
  });

  it('keeps the generated fields of regions.json in step with the geometry', () => {
    const facts = deriveRegionFacts(topology);
    for (const region of regionsDoc.items) {
      const fact = facts[region.id];
      assert.deepEqual(region.neighbors, fact.neighbors, `${region.id}: neighbors are out of date, run npm run build:map`);
      assert.deepEqual(region.lonlat, fact.lonlat, `${region.id}: lonlat is out of date, run npm run build:map`);
    }
  });

  it('lies inside the theater box and stays within the size budget', () => {
    const [west, south, east, north] = groups.bbox;
    for (const region of regionsDoc.items) {
      assert.ok(region.lonlat[0] > west && region.lonlat[0] < east && region.lonlat[1] > south && region.lonlat[1] < north, `${region.id} centre is outside the box`);
    }
    assert.ok(fs.statSync(topologyFile).size <= 150 * 1024, 'the geometry should stay under 150 KB (ARCHITECTURE §9.1)');
  });

  it('knows the neighbours the real world has, across countries', () => {
    const neighbours = (/** @type {string} */ id) => new Set(regionsDoc.items.find((/** @type {any} */ r) => r.id === id).neighbors);
    assert.ok(neighbours('IRQ-basra').has('KWT-jahra'));
    assert.ok(neighbours('IRQ-basra').has('IRN-khuzestan'));
    assert.ok(neighbours('EGY-sinai').has('ISR-south'));
    assert.ok(neighbours('SAU-eastern').has('QAT-doha'));
    assert.ok(neighbours('TUR-southeast_anatolia').has('SYR-aleppo'));
    assert.ok(neighbours('OMN-musandam').has('ARE-north'));
    assert.equal(neighbours('BHR-main_island').size, 1, 'Bahrain is an island: only its other region');
  });

  it('draws grey neighbours around the theater, and none of them is a playable country', () => {
    const ids = new Set(context.map((f) => f.properties.id));
    for (const id of ['GRC', 'GEO', 'ARM', 'AZE', 'TKM', 'AFG', 'PAK', 'LBY', 'SDN', 'ERI', 'DJI', 'SOM']) assert.ok(ids.has(id), `${id} is missing from the context`);
    for (const country of countriesDoc.items) assert.equal(ids.has(country.id), false, `${country.id} is playable, so it must not be context`);
  });

  it('puts Musandam, Hormozgan and the Suez Canal zone on the map as their own regions (the chokepoints)', () => {
    const ids = new Set(regions.map((f) => f.properties.region));
    for (const id of ['OMN-musandam', 'IRN-hormozgan', 'EGY-canal', 'YEM-tihama']) assert.ok(ids.has(id), id);
  });

  it('has one whole-country shape per playable country, matching countries.json', () => {
    assert.deepEqual(countryShapes.map((f) => f.properties.country).sort(), countriesDoc.items.map((/** @type {any} */ c) => c.id).sort());
    for (const f of countryShapes) assert.ok(f.polygons.length > 0, `${f.properties.country} has no shape`);
  });

  it('stores the map box and a label point for every country and region, inside the box', () => {
    const [x0, y0, x1, y1] = topology.gs.box;
    assert.ok(x0 < x1 && y0 < y1, 'the box is a real rectangle');
    const inBox = (/** @type {number[]} */ [x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    for (const country of countriesDoc.items) {
      const at = topology.gs.labels.countries[country.id];
      assert.ok(at && inBox(at), `${country.id} has no label point inside the map box`);
    }
    for (const region of regionsDoc.items) {
      const at = topology.gs.labels.regions[region.id];
      assert.ok(at && inBox(at), `${region.id} has no label point inside the map box`);
    }
  });
});

describe('the grey world file (data/map/world.topo.json)', () => {
  const decodedWorld = decodeArcs(worldTopology);
  const grey = featuresOf(worldTopology, 'countries', decodedWorld);

  it('has a name and an id for every country, none of them playable and none twice', () => {
    const ids = grey.map((f) => f.properties.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const f of grey) assert.ok(typeof f.properties.name === 'string' && f.properties.name.length > 0, `${f.properties.id} has no name`);
    const playable = new Set(groups.countries);
    for (const id of ids) assert.equal(playable.has(id), false, `${id} is playable, so it must not be in the grey world`);
    for (const id of groups.countries) assert.equal(countriesDoc.items.some((/** @type {any} */ c) => c.id === id), true, `${id} is in countries.json`);
  });

  it('keeps the grey world out of the game data: no grey country is in countries.json or regions.json', () => {
    const inData = new Set([...countriesDoc.items.map((/** @type {any} */ c) => c.id), ...regionsDoc.items.map((/** @type {any} */ r) => r.country)]);
    for (const f of grey) assert.equal(inData.has(f.properties.id), false, `${f.properties.id} leaked into the game data`);
  });

  it('has a label point inside the map box for every country that has a shape', () => {
    const [x0, y0, x1, y1] = worldTopology.gs.box;
    for (const f of grey) {
      const at = worldTopology.gs.labels.countries[f.properties.id];
      if (f.polygons.length === 0) continue;
      assert.ok(at && at[0] >= x0 && at[0] <= x1 && at[1] >= y0 && at[1] <= y1, `${f.properties.id} has no label point in the box`);
    }
  });

  it('stays within the size budget and shares the theater\'s map units', () => {
    assert.ok(fs.statSync(worldFile).size <= 150 * 1024, 'the world file should stay under 150 KB');
    assert.equal(worldTopology.gs.units, topology.gs.units);
    assert.equal(worldTopology.gs.projection, topology.gs.projection);
    assert.equal(worldTopology.gs.naturalEarth, topology.gs.naturalEarth, 'both files come from the same Natural Earth commit');
    const [x0, y0, x1, y1] = worldTopology.gs.box;
    assert.ok(Math.abs(x1 - x0 - 2 * Math.PI * 6378.137) < 1, 'the whole width of the earth');
    for (const arc of decodedWorld) for (let i = 0; i < arc.length; i += 2) {
      assert.ok(Number.isFinite(arc[i]) && Number.isFinite(arc[i + 1]) && arc[i] >= x0 - 1 && arc[i] <= x1 + 1 && arc[i + 1] >= y0 - 1 && arc[i + 1] <= y1 + 1, 'a coordinate outside the box or not a number');
    }
  });

  it('contains the theater\'s box, so the two files overlap where the grey neighbours are', () => {
    const [wx0, wy0, wx1, wy1] = worldTopology.gs.box;
    const [tx0, ty0, tx1, ty1] = topology.gs.box;
    assert.ok(wx0 < tx0 && wy0 < ty0 && wx1 > tx1 && wy1 > ty1);
  });
});
