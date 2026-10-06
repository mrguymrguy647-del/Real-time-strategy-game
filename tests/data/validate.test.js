import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateKeys, readDatasetFromDisk, validateDataset } from '../../tools/lib/validate.mjs';
import { ROOT } from '../helpers/data.js';

const base = readDatasetFromDisk(ROOT);

/** Validate a modified copy of the real data. @param {(files: any) => void} mutate */
function check(mutate) {
  const files = structuredClone(base.files);
  mutate(files);
  return validateDataset({ files, schemas: base.schemas });
}

/** @param {(files: any) => void} mutate @param {RegExp} pattern */
function expectError(mutate, pattern) {
  const { errors } = check(mutate);
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got:\n${errors.join('\n') || '(none)'}`);
}

describe('data validation', () => {
  it('accepts the real data with no errors and no warnings', () => {
    const result = validateDataset(base);
    assert.deepEqual(result, { errors: [], warnings: [] });
  });

  it('rejects a misspelled or extra field (strict schemas)', () => {
    expectError((f) => void (f.governments.items[0].rules.hasCapitol = true), /additional properties/);
    expectError((f) => void (f.balance.values.market.inertiaa = 0.5), /additional properties/);
  });

  it('rejects wrong types and out-of-range numbers', () => {
    expectError((f) => void (f.resources.items[0].basePrice = '800'), /must be number/);
    expectError((f) => void (f.governments.items[0].failure.below = 150), /must be <= 100/);
    expectError((f) => void (f.scenarios.items[0].startDate = '2026-13'), /must match pattern/);
  });

  it('rejects a stat that does not exist', () => {
    expectError((f) => void (f.governments.items[0].modifiers[0].stat = 'country.economy.growht'), /unknown stat "country\.economy\.growht"/);
    expectError((f) => void (f.resources.items[0].shortage[0].effects[0].stat = 'country.nothing.here'), /unknown stat/);
  });

  it('rejects an unknown action and an action without its arguments', () => {
    expectError((f) => void (f.governments.items[1].ability.effects = [{ do: 'launchRocket' }]), /unknown action "launchRocket"/);
    expectError((f) => void (f.governments.items[1].ability.effects = [{ do: 'setFlag' }]), /action "setFlag" needs "flag"/);
  });

  it('requires power centers to sum to 1', () => {
    expectError((f) => void (f.governments.items[0].powerCenters.people = 0.9), /powerCenters must sum to 1/);
  });

  it('requires a complete, known affinity matrix', () => {
    expectError((f) => void delete f.governments.items[0].transition.affinity.junta, /affinity is missing "junta"/);
    expectError((f) => void (f.governments.items[0].transition.affinity.pirates = 0.1), /unknown government "pirates"/);
  });

  it('requires shortage steps to go from higher to lower coverage', () => {
    expectError((f) => void f.resources.items[0].shortage.reverse(), /must go from higher to lower coverageBelow/);
  });

  it('rejects duplicate ids', () => {
    expectError((f) => void f.governments.items.push(structuredClone(f.governments.items[0])), /duplicate id "democracy"/);
  });

  it('checks balance relationships', () => {
    expectError((f) => void (f.balance.values.stability.stages.crisis = 80), /stages must descend/);
    expectError((f) => void (f.balance.values.combat.moraleMin = 1.5), /moraleMin must not exceed/);
  });

  it('requires a label for every stat, the months, and the app title', () => {
    expectError((f) => void delete f.i18n.strings['stat.world.tension'], /label for stat "world\.tension"/);
    expectError((f) => void delete f.i18n.strings['month.7'], /missing "month\.7"/);
    expectError((f) => void delete f.i18n.strings['app.title'], /missing "app\.title"/);
  });

  it('checks UI text: placeholders, plural pairs, empty strings', () => {
    expectError((f) => void (f.i18n.strings['news.demoRoll'] = 'The dice rolled {n.'), /broken \{placeholder\}/);
    expectError((f) => void (f.i18n.strings['x.count.one'] = '{n} thing'), /no matching "\.other"/);
    expectError((f) => void (f.i18n.strings['x.count.other'] = '{n} things'), /no matching "\.one"/);
    expectError((f) => void (f.i18n.strings['x.empty'] = ''), /minLength|NOT have fewer than 1/i);
    expectError((f) => void (f.i18n.strings['BadKey'] = 'text'), /pattern/);
  });

  it('warns about stray spaces in UI text', () => {
    const { warnings } = check((f) => void (f.i18n.strings['app.tagline'] = ' padded '));
    assert.ok(warnings.some((w) => /leading or trailing spaces/.test(w)));
  });
});

describe('countries and regions', () => {
  /** @param {any} f @param {string} id */
  const region = (f, id) => f.regions.items.find((/** @type {any} */ r) => r.id === id);
  /** @param {any} f @param {string} id */
  const country = (f, id) => f.countries.items.find((/** @type {any} */ c) => c.id === id);

  it('requires a region id to start with its country, and the country to exist', () => {
    expectError((f) => void (region(f, 'IRQ-basra').id = 'KWT-basra'), /id must start with its country "IRQ-"/);
    expectError((f) => void (region(f, 'IRQ-basra').country = 'ZZZ'), /unknown country "ZZZ"/);
  });

  it('requires neighbors to exist, to be symmetric, and never to be the region itself', () => {
    expectError((f) => void region(f, 'IRQ-basra').neighbors.push('IRQ-atlantis'), /neighbor "IRQ-atlantis" does not exist/);
    expectError((f) => void region(f, 'IRQ-basra').neighbors.push('SAU-tabuk'), /must be symmetric: "SAU-tabuk" does not list "IRQ-basra"/);
    expectError((f) => void region(f, 'IRQ-basra').neighbors.push('IRQ-basra'), /cannot be its own neighbor/);
  });

  it('requires a contested region to carry a neutral note (G-22)', () => {
    expectError((f) => void delete region(f, 'PSX-gaza').note, /contested region needs a neutral "note"/);
  });

  it('requires a known government, and at least one region per country', () => {
    expectError((f) => void (country(f, 'KWT').government = 'pirates'), /unknown government "pirates"/);
    expectError((f) => void (f.regions.items = f.regions.items.filter((/** @type {any} */ r) => r.country !== 'BHR')), /\(BHR\).*has no regions/);
  });

  it('requires the capital to be a real city of tier "capital" in the right country, and to be the only one', () => {
    expectError((f) => void (country(f, 'IRQ').capital.region = 'IRN-tehran'), /belongs to another country/);
    expectError((f) => void (country(f, 'IRQ').capital.name = 'Atlantis'), /has no "Atlantis" with tier "capital"/);
    expectError((f) => void region(f, 'IRQ-basra').cities.push({ name: 'Basra Two', tier: 'capital' }), /exactly one city with tier "capital"/);
  });

  it('checks shares: all or none per country, and summing to 1', () => {
    expectError((f) => void (region(f, 'KWT-ahmadi').popShare = 0.5), /popShare must be set on every region or on none/);
    expectError((f) => void f.regions.items.filter((/** @type {any} */ r) => r.country === 'KWT').forEach((/** @type {any} */ r) => void (r.gdpShare = 0.5)), /gdpShare must sum to 1/);
    expectError((f) => void (region(f, 'KWT-ahmadi').output = { oil: 0.5 }), /output of "oil" must sum to 1/);
    expectError((f) => void (region(f, 'KWT-ahmadi').output = { unobtainium: 1 }), /unknown resource "unobtainium"/);
  });

  it('accepts shares that are complete', () => {
    const { errors } = check((f) => {
      const own = f.regions.items.filter((/** @type {any} */ r) => r.country === 'KWT');
      own.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
        r.popShare = i === 0 ? 0.5 : 0.25;
        r.output = { oil: i === 0 ? 0.5 : 0.25 };
      });
    });
    assert.deepEqual(errors, []);
  });
});

describe('duplicate key detection', () => {
  it('finds a repeated key and reports its line', () => {
    assert.deepEqual(findDuplicateKeys('{\n  "a": 1,\n  "b": 2,\n  "a": 3\n}'), ['duplicate key "a" at line 4']);
  });

  it('does not confuse the same key in different objects or array items', () => {
    assert.deepEqual(findDuplicateKeys('{"a":{"x":1},"b":{"x":2},"list":[{"x":1},{"x":2}]}'), []);
  });

  it('ignores colons and braces inside strings', () => {
    assert.deepEqual(findDuplicateKeys('{"a":"he said \\"x\\": {y}","b":"a: b"}'), []);
  });

  it('finds repeats in nested objects', () => {
    assert.equal(findDuplicateKeys('{"o":{"k":1,"k":2}}').length, 1);
  });

  it('is clean for every real data file', () => {
    for (const [key, text] of Object.entries(base.rawTexts)) assert.deepEqual(findDuplicateKeys(text), [], key);
  });
});
