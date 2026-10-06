// The map file as the view sees it: shapes in world units, arc kinds, country adjacency and labels.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ARC, WORLD_WIDTH, buildMapGeometry } from '../../src/ui/map/mapData.js';
import { createHitIndex, pointInPolygon } from '../../src/ui/map/hit.js';
import { COUNTRY_PALETTE } from '../../src/ui/map/coloring.js';
import { ROOT, readJsonFromDisk } from '../helpers/data.js';

const topology = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/map/middle_east.topo.json'), 'utf8'));
const geometry = buildMapGeometry(topology);
const regionsDoc = await readJsonFromDisk('data/regions.json');
const countriesDoc = await readJsonFromDisk('data/countries.json');

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
    const counts = [0, 0, 0, 0];
    for (const kind of geometry.arcKind) counts[kind]++;
    assert.ok(counts[ARC.OUTER] > 0 && counts[ARC.REGION] > 0 && counts[ARC.BORDER] > 0 && counts[ARC.CONTEXT] > 0, `arc kinds ${counts}`);
    assert.equal(counts.reduce((a, b) => a + b, 0), geometry.arcs.length);
  });

  it('gives the edge of the map no coast line: arcs along it belong to the grey neighbours only', () => {
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
      assert.equal(geometry.arcKind[index], ARC.CONTEXT, `arc ${index} runs along the map edge but would be drawn`);
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
