// The map file as the view sees it: shapes in world units, arc kinds, country adjacency and labels.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ARC, WORLD_WIDTH, buildMapGeometry } from '../../src/ui/map/mapData.js';
import { createHitIndex, distanceToRing, pointInPolygon } from '../../src/ui/map/hit.js';
import { COUNTRY_PALETTE } from '../../src/ui/map/coloring.js';
import { ROOT, readJsonFromDisk } from '../helpers/data.js';

const topology = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map/middle_east.topo.json'), 'utf8'));
const geometry = buildMapGeometry(topology);
const worldTopology = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map/world.topo.json'), 'utf8'));
const withWorld = buildMapGeometry(topology, worldTopology);
const world = /** @type {NonNullable<typeof withWorld.world>} */ (withWorld.world);
const regionsDoc = await readJsonFromDisk('data/regions.json');
const countriesDoc = await readJsonFromDisk('data/countries.json');

describe('putting a longitude and latitude on the map', () => {
  it('lands a region\'s own centre point inside that region', () => {
    const hits = createHitIndex(geometry.regions);
    for (const id of ['IRQ-basra', 'TUR-central_anatolia', 'SAU-riyadh', 'EGY-cairo_giza', 'IRN-tehran', 'YEM-sanaa', 'ISR-tel_aviv']) {
      const region = regionsDoc.items.find((/** @type {any} */ r) => r.id === id);
      const [x, y] = geometry.project(region.lonlat[0], region.lonlat[1]);
      assert.equal(hits.hit(x, y, 0)?.id, id, id);
    }
  });

  it('puts the straits where they belong: inside the map, on the water between the regions that control them', async () => {
    const { items } = await readJsonFromDisk('data/chokepoints.json');
    for (const strait of items) {
      const [x, y] = geometry.project(strait.position[0], strait.position[1]);
      assert.ok(x > 0 && x < geometry.width && y > 0 && y < geometry.height, `${strait.id} is on the map`);
      // within a few hundred kilometres of the regions that control it (a world unit is about 1.5 km)
      const near = strait.controlRegions.map((id) => {
        const region = geometry.regions.find((r) => r.id === id);
        return region ? Math.hypot(region.label[0] - x, region.label[1] - y) : Infinity;
      });
      assert.ok(Math.min(...near) < 350, `${strait.id} is ${Math.min(...near).toFixed(0)} units from its control regions`);
    }
  });
});

describe('map geometry in world units', () => {
  it('spans the world width, with y pointing down and the whole map inside', () => {
    assert.equal(geometry.width, WORLD_WIDTH);
    assert.ok(geometry.height > 2500 && geometry.height < 3000, `height ${geometry.height}`);
    for (const region of geometry.regions) {
      assert.ok(region.box.minX >= -1 && region.box.maxX <= geometry.width + 1, `${region.id} is outside horizontally`);
      assert.ok(region.box.minY >= -1 && region.box.maxY <= geometry.height + 1, `${region.id} is outside vertically`);
    }
  });

  it('has every region and every country of the data, with their regions listed', () => {
    assert.deepEqual(geometry.regions.map((r) => r.id).sort(), regionsDoc.items.map((/** @type {any} */ r) => r.id).sort());
    assert.deepEqual(geometry.countries.map((c) => c.id).sort(), countriesDoc.items.map((/** @type {any} */ c) => c.id).sort());
    for (const country of geometry.countries) {
      const expected = regionsDoc.items.filter((/** @type {any} */ r) => r.country === country.id).map((/** @type {any} */ r) => r.id).sort();
      assert.deepEqual([...country.regions].sort(), expected);
    }
  });

  it('places north above south: Turkey is higher on the screen than Yemen', () => {
    const turkey = geometry.countries.find((c) => c.id === 'TUR');
    const yemen = geometry.countries.find((c) => c.id === 'YEM');
    assert.ok(turkey && yemen && turkey.label[1] < yemen.label[1]);
  });

  it('puts every label inside its shape (not just near it)', () => {
    for (const country of geometry.countries) {
      assert.ok(country.polygons.some((p) => pointInPolygon(p, country.label[0], country.label[1])), `${country.id} label is outside the country`);
    }
    for (const region of geometry.regions) {
      assert.ok(region.polygons.some((p) => pointInPolygon(p, region.label[0], region.label[1])), `${region.id} label is outside the region`);
    }
  });

  it('draws shared borders once: every arc has exactly one kind, and every kind occurs', () => {
    const counts = [0, 0, 0, 0, 0];
    for (const kind of geometry.arcKind) counts[kind]++;
    assert.ok(counts[ARC.OUTER] > 0 && counts[ARC.REGION] > 0 && counts[ARC.BORDER] > 0 && counts[ARC.CONTEXT] > 0 && counts[ARC.EDGE] > 0, `arc kinds ${counts}`);
    assert.equal(counts.reduce((a, b) => a + b, 0), geometry.arcs.length);
  });

  it('gives the edge of the theater no line: arcs along its box are their own kind and are never drawn', () => {
    const { width, height } = geometry;
    const onEdge = (/** @type {Float64Array} */ arc) => {
      const xs = Array.from({ length: arc.length / 2 }, (_, i) => arc[i * 2]);
      const ys = Array.from({ length: arc.length / 2 }, (_, i) => arc[i * 2 + 1]);
      const along = (/** @type {number[]} */ values, /** @type {number} */ edge) => values.every((v) => Math.abs(v - edge) < 0.5);
      return along(xs, 0) || along(xs, width) || along(ys, 0) || along(ys, height);
    };
    let edgeArcs = 0;
    geometry.arcs.forEach((arc, index) => {
      if (!onEdge(arc)) return;
      edgeArcs++;
      assert.equal(geometry.arcKind[index], ARC.EDGE, `arc ${index} runs along the map edge but would be drawn`);
    });
    assert.ok(edgeArcs > 0, 'the grey neighbours are cut at the map edge');
  });
});

describe('countries that touch', () => {
  const touches = (/** @type {string} */ a, /** @type {string} */ b) => geometry.countryNeighbours.get(a)?.has(b);

  it('knows the real land borders, in both directions', () => {
    for (const [a, b] of [['IRQ', 'IRN'], ['IRQ', 'KWT'], ['IRQ', 'SYR'], ['TUR', 'SYR'], ['SAU', 'YEM'], ['SAU', 'OMN'], ['EGY', 'ISR'], ['JOR', 'ISR'], ['ISR', 'LBN'], ['OMN', 'ARE']]) {
      assert.ok(touches(a, b), `${a} should touch ${b}`);
      assert.ok(touches(b, a), `${b} should touch ${a}`);
    }
  });

  it('does not invent borders across water', () => {
    for (const [a, b] of [['BHR', 'SAU'], ['BHR', 'QAT'], ['EGY', 'SAU'], ['IRN', 'SAU'], ['IRN', 'OMN'], ['IRN', 'ARE']]) assert.ok(!touches(a, b), `${a} and ${b} are separated by sea`);
    assert.equal(geometry.countryNeighbours.get('BHR')?.size, 0, 'Bahrain is an island');
  });

  it('colors neighbouring countries differently, from the palette', () => {
    for (const [a, set] of geometry.countryNeighbours) {
      assert.ok((geometry.colorOf.get(a) ?? -1) < COUNTRY_PALETTE.length);
      for (const b of set) assert.notEqual(geometry.colorOf.get(a), geometry.colorOf.get(b), `${a} and ${b} share a color`);
    }
  });
});

describe('tapping the real map', () => {
  const index = createHitIndex(geometry.regions);
  const regionAt = (/** @type {string} */ id) => /** @type {any} */ (geometry.regions.find((r) => r.id === id));

  it('finds the region under the label point of every region', () => {
    for (const region of geometry.regions) assert.equal(index.hit(region.label[0], region.label[1])?.id, region.id);
  });

  it('finds nothing over open sea', () => {
    assert.equal(index.hit(40, 2700), null, 'the Mediterranean corner');
  });

  it('can still tap a tiny region with a little slop (Bahrain)', () => {
    const [x, y] = regionAt('BHR-capital').label;
    assert.equal(index.hit(x + 6, y, 12)?.id, 'BHR-capital');
  });
});

describe('the grey world around the theater', () => {
  it('is absent unless asked for, and the theater is the same either way', () => {
    assert.equal(geometry.world, null);
    assert.deepEqual(withWorld.theater, { minX: 0, minY: 0, maxX: geometry.width, maxY: geometry.height });
    assert.deepEqual(withWorld.regions.map((r) => r.id), geometry.regions.map((r) => r.id));
  });

  it('is a rectangle that contains the theater, wider than it is tall, and about 26 times its width', () => {
    const { rect } = world;
    assert.ok(rect.minX < 0 && rect.minY < 0 && rect.maxX > geometry.width && rect.maxY > geometry.height, 'the theater sits inside the world');
    const width = rect.maxX - rect.minX;
    assert.ok(width > geometry.width * 8 && width < geometry.width * 10, `${width / geometry.width} theater widths across`);
    assert.ok((rect.maxY - rect.minY) / width > 0.5 && (rect.maxY - rect.minY) / width < 0.65, 'the map is about 0.59 as tall as wide');
  });

  it('has the countries of the world but none of the 16 playable ones, and no Antarctica', () => {
    const ids = new Set(world.countries.map((c) => c.id));
    assert.ok(world.countries.length > 220, `${world.countries.length} grey countries`);
    for (const id of ['FRA', 'DEU', 'USA', 'BRA', 'CHN', 'IND', 'RUS', 'AUS', 'LBY', 'SDN', 'GEO']) assert.ok(ids.has(id), `${id} is missing`);
    for (const country of countriesDoc.items) assert.equal(ids.has(country.id), false, `${country.id} is playable, so it is not grey`);
    assert.equal(ids.has('ATA'), false);
    assert.equal(ids.size, world.countries.length, 'ids are unique');
  });

  it('gives every grey country a name, shapes inside the world, a label inside its largest shape, and a mainland box', () => {
    for (const country of world.countries) {
      assert.ok(country.name.length > 0, `${country.id} has no name`);
      assert.ok(country.box.minX >= world.rect.minX - 1 && country.box.maxX <= world.rect.maxX + 1 && country.box.minY >= world.rect.minY - 1 && country.box.maxY <= world.rect.maxY + 1, `${country.id} sticks out of the world`);
      assert.ok(country.polygons.some((p) => pointInPolygon(p, country.label[0], country.label[1])), `${country.id}'s label is outside it`);
      assert.ok(country.focus.minX >= country.box.minX && country.focus.maxX <= country.box.maxX, `${country.id}'s mainland is part of it`);
      assert.ok(country.size > 0 && country.size <= Math.max(country.box.maxX - country.box.minX, country.box.maxY - country.box.minY) + 1e-6);
    }
    // France has overseas land far away, but its label size is that of the mainland.
    const france = world.byId.get('FRA');
    assert.ok(france && france.size < (france.box.maxX - france.box.minX) / 3, 'the mainland is much smaller than the box that holds the overseas parts too');
  });

  it('lines up with the theater: where Egypt ends Libya begins, within a few units', () => {
    const egypt = geometry.countries.find((c) => c.id === 'EGY');
    const libya = world.byId.get('LBY');
    assert.ok(egypt && libya);
    // The western edge of Egypt is its border with Libya (the straight part: the same meridian, 25 degrees east).
    const western = [];
    for (const polygon of egypt.polygons) for (let i = 0; i < polygon[0].length; i += 2) if (polygon[0][i] < egypt.box.minX + 3) western.push([polygon[0][i], polygon[0][i + 1]]);
    assert.ok(western.length > 0);
    for (const [x, y] of western) {
      const gap = Math.min(...libya.polygons.map((polygon) => (pointInPolygon(polygon, x, y) ? 0 : Math.min(...polygon.map((ring) => distanceToRing(ring, x, y))))));
      assert.ok(gap < 6, `Egypt's border point (${x.toFixed(0)}, ${y.toFixed(0)}) is ${gap.toFixed(1)} units from Libya`);
    }
  });

  it('answers a tap on a grey country (and not on the sea), and a playable country is not hit by it', () => {
    const grey = createHitIndex(world.countries, { cell: 256 });
    const georgia = world.byId.get('GEO');
    assert.ok(georgia);
    assert.equal(grey.hit(georgia.label[0], georgia.label[1])?.id, 'GEO');
    assert.equal(grey.hit(world.rect.minX + 50, (world.rect.minY + world.rect.maxY) / 2 + 600), null, 'the Pacific is nothing');
    const iran = geometry.countries.find((c) => c.id === 'IRN');
    assert.ok(iran);
    assert.equal(grey.hit(iran.label[0], iran.label[1])?.id ?? null, null, 'the playable countries are not in the grey index');
  });
});
