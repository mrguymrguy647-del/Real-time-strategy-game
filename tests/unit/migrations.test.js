import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SaveError } from '../../src/core/errors.js';
import { MIGRATIONS, migrateRecord } from '../../src/core/migrations.js';
import { SAVE_VERSION } from '../../src/core/version.js';

const record = (version) => ({ saveVersion: version, state: { meta: { saveVersion: version }, marker: [] } });

const code = (expected) => (err) => err instanceof SaveError && err.code === expected;

describe('save migrations', () => {
  it('returns a current record untouched', () => {
    const current = record(3);
    assert.equal(migrateRecord(current, { target: 3, migrations: {} }), current);
  });

  it('applies each step in turn, oldest first', () => {
    const migrations = {
      1: (r) => ({ ...r, saveVersion: 2, state: { ...r.state, marker: [...r.state.marker, 'v1->v2'] } }),
      2: (r) => ({ ...r, saveVersion: 3, state: { ...r.state, marker: [...r.state.marker, 'v2->v3'] } }),
    };
    const result = migrateRecord(record(1), { target: 3, migrations });
    assert.equal(result.saveVersion, 3);
    assert.deepEqual(result.state.marker, ['v1->v2', 'v2->v3']);
  });

  it('never mutates the record it was given', () => {
    const original = record(1);
    const before = JSON.stringify(original);
    migrateRecord(original, {
      target: 2,
      migrations: { 1: (r) => { r.saveVersion = 2; r.state.marker.push('x'); return r; } },
    });
    assert.equal(JSON.stringify(original), before);
  });

  it('refuses saves from a newer game', () => {
    assert.throws(() => migrateRecord(record(9), { target: 3, migrations: {} }), code('too_new'));
  });

  it('reports a missing step', () => {
    assert.throws(() => migrateRecord(record(1), { target: 3, migrations: { 1: (r) => ({ ...r, saveVersion: 2 }) } }), code('migration_missing'));
  });

  it('reports a step that throws or forgets to bump the version', () => {
    assert.throws(
      () => migrateRecord(record(1), { target: 2, migrations: { 1: () => { throw new Error('bad data'); } } }),
      (err) => code('migration_failed')(err) && /bad data/.test(err.message),
    );
    assert.throws(() => migrateRecord(record(1), { target: 2, migrations: { 1: (r) => r } }), code('migration_failed'));
  });

  it('rejects records without a usable version', () => {
    for (const bad of [null, 'text', {}, { saveVersion: 0 }, { saveVersion: 1.5 }, { saveVersion: '1' }]) {
      assert.throws(() => migrateRecord(bad, { target: 1, migrations: {} }), code('bad_file'), JSON.stringify(bad));
    }
  });

  it('refuses a save of the early test game (version 1) and of the first economy preview (version 2), each with its own reason', () => {
    assert.equal(SAVE_VERSION, 3);
    assert.throws(() => migrateRecord(record(1), { migrations: MIGRATIONS }), (err) => code('too_old')(err) && /no country/.test(err.message));
    assert.throws(() => migrateRecord(record(2), { migrations: MIGRATIONS }), (err) => code('too_old')(err) && /no resources or market/.test(err.message));
  });
});
