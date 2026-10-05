import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_FILES, buildData, loadData } from '../../src/core/data.js';
import { DataError } from '../../src/core/errors.js';
import { loadTestData, readJsonFromDisk } from '../helpers/data.js';

/** Fresh raw copies of every data file. */
async function readRaw() {
  return Object.fromEntries(await Promise.all(DATA_FILES.map(async (f) => [f.key, await readJsonFromDisk(f.path)])));
}

describe('data loader', () => {
  it('loads the real data and indexes it', async () => {
    const data = await loadTestData();
    assert.match(data.version, /^[0-9a-f]{12}$/);
    assert.equal(data.scenarios.byId.scaffold_test.startDate, '2026-01');
    assert.deepEqual(
      data.governments.items.map((g) => g.id),
      ['democracy', 'authoritarian', 'monarchy', 'junta', 'communist', 'anarchist'],
    );
    assert.equal(data.resources.byId.oil.enabled, true);
    assert.equal(data.resources.byId.water.enabled, false);
    assert.equal(data.i18n.lang, 'en');
    assert.equal(data.i18n.strings['app.title'], 'Grand Strategy');
  });

  it('freezes everything so code cannot change content by accident', async () => {
    const data = await loadTestData();
    assert.throws(() => {
      data.balance.time.capitalRegroupMonths = 99;
    }, TypeError);
    assert.throws(() => {
      data.governments.byId.democracy.rules.hasCapital = false;
    }, TypeError);
  });

  it('names the file when it cannot be read', async () => {
    await assert.rejects(
      loadData(async (p) => {
        if (p === 'data/balance.json') throw new Error('404');
        return readJsonFromDisk(p);
      }),
      (err) => err instanceof DataError && /data\/balance\.json/.test(err.message) && /404/.test(err.message),
    );
  });

  it('rejects a file with the wrong schema name, version or body', async () => {
    const raw = await readRaw();
    const reader = (change) => async (p) => {
      const json = structuredClone(await readJsonFromDisk(p));
      return change(p, json) ?? json;
    };
    await assert.rejects(
      loadData(reader((p, j) => void (p.endsWith('resources.json') && (j.schema = 'oops')))),
      /expected schema "resources" but found "oops"/,
    );
    await assert.rejects(
      loadData(reader((p, j) => void (p.endsWith('scenarios.json') && (j.version = 'one')))),
      /"version" must be an integer/,
    );
    await assert.rejects(
      loadData(reader((p, j) => void (p.endsWith('governments.json') && delete j.items))),
      /"items" is missing/,
    );
    assert.ok(raw.balance);
  });

  it('rejects duplicate ids', async () => {
    const raw = await readRaw();
    raw.resources.items.push(structuredClone(raw.resources.items[0]));
    assert.throws(() => buildData(raw), /resources: duplicate id "oil"/);
  });

  it('versions content but not UI text, so editing a sentence never invalidates saves', async () => {
    const base = buildData(await readRaw());

    const reworded = await readRaw();
    reworded.i18n.strings['app.tagline'] = 'A different tagline';
    assert.equal(buildData(reworded).version, base.version);

    const rebalanced = await readRaw();
    rebalanced.balance.values.market.inertia = 0.5;
    assert.notEqual(buildData(rebalanced).version, base.version);
  });
});
