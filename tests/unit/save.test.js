import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SaveError } from '../../src/core/errors.js';
import { AUTO_SLOTS, createSaveManager } from '../../src/core/save.js';
import { createMemoryStorage } from '../../src/core/storage/memory.js';
import { textToBytes, bytesToText } from '../../src/util/compress.js';
import { createGame } from '../../src/game.js';
import { loadTestData } from '../helpers/data.js';

const data = await loadTestData();

/** A manager over fresh memory storage with a clock that ticks by 1000 ms per call. */
function setup({ dataVersion = data.version, storage = createMemoryStorage() } = {}) {
  let time = 1_000_000;
  const manager = createSaveManager({ storage, dataVersion, now: () => (time += 1000) });
  return { storage, manager };
}

/** A real game state after some turns. */
function stateAfter(turns, seed = 1) {
  const game = createGame({ data, seed, playerId: 'TUR', checkInvariants: true });
  for (let i = 0; i < turns; i++) assert.ok(game.endTurn().ok);
  return game.state;
}

const code = (expected) => (err) => err instanceof SaveError && err.code === expected;

describe('save manager', () => {
  it('saves and loads a game exactly', async () => {
    const { manager } = setup();
    const state = stateAfter(5);
    await manager.save('manual-1', state);
    const loaded = await manager.load('manual-1');
    assert.deepEqual(loaded.state, state);
    assert.equal(loaded.meta.turn, 5);
    assert.equal(loaded.dataMismatch, false);
  });

  it('lists slots newest first, without loading the games', async () => {
    const { manager } = setup();
    await manager.save('manual-2', stateAfter(1));
    await manager.save('manual-1', stateAfter(2));
    const slots = await manager.list();
    assert.deepEqual(slots.map((s) => s.slot), ['manual-1', 'manual-2']);
    assert.equal(slots[0].meta.turn, 2);
    assert.equal('state' in slots[0], false);
  });

  it('rejects unknown slots, empty slots and broken states', async () => {
    const { manager } = setup();
    await assert.rejects(manager.save('slot-9', stateAfter(0)), code('bad_slot'));
    await assert.rejects(manager.load('manual-3'), code('not_found'));
    await assert.rejects(manager.save('manual-1', { nonsense: true }), code('bad_file'));
  });

  it('copies the state at the moment of saving, not when the write finishes', async () => {
    const { manager } = setup();
    const state = stateAfter(1);
    const pending = manager.save('manual-1', state);
    state.countries.TUR.economy.treasuryMn = 999; // the game keeps running while the write is in flight
    await pending;
    assert.notEqual((await manager.load('manual-1')).state.countries.TUR.economy.treasuryMn, 999);
  });

  it('leaves out saves of the early test game: Continue loads the newest one that can be played, with nothing "skipped"', async () => {
    const { manager, storage } = setup();
    await manager.save('manual-1', stateAfter(2));
    const old = { slot: 'manual-2', savedAt: 9_999_999_999, saveVersion: 1, dataVersion: 'old', meta: { countryId: null, year: 2026, month: 3, week: 1, turn: 2, scenarioId: 'scaffold_test', difficulty: 'normal' }, state: { meta: { saveVersion: 1 } } };
    await storage.putMany([{ store: 'saves', key: 'manual-2', value: old }, { store: 'slots', key: 'manual-2', value: { slot: 'manual-2', savedAt: old.savedAt, saveVersion: 1, dataVersion: 'old', meta: old.meta } }]);
    await assert.rejects(manager.load('manual-2'), code('too_old'));
    const latest = await manager.loadLatest();
    assert.equal(latest?.slot, 'manual-1');
    assert.deepEqual(latest?.skipped, []);
  });

  it('says the saves are too old, not damaged, when the early test game is all there is', async () => {
    const { manager, storage } = setup();
    const meta = { countryId: null, year: 2026, month: 3, week: 1, turn: 2, scenarioId: 'scaffold_test', difficulty: 'normal' };
    await storage.putMany([
      { store: 'saves', key: 'manual-1', value: { slot: 'manual-1', savedAt: 1, saveVersion: 1, dataVersion: 'old', meta, state: { meta: { saveVersion: 1 } } } },
      { store: 'slots', key: 'manual-1', value: { slot: 'manual-1', savedAt: 1, saveVersion: 1, dataVersion: 'old', meta } },
    ]);
    await assert.rejects(manager.loadLatest(), code('too_old'));
  });

  it('rotates through three autosave slots', async () => {
    const { manager } = setup();
    const used = [];
    for (let i = 0; i < 4; i++) used.push((await manager.autosave(stateAfter(i))).slot);
    assert.deepEqual(used, ['auto-1', 'auto-2', 'auto-3', 'auto-1']);
    assert.equal((await manager.loadLatest())?.meta.turn, 3);
  });

  it('writes quick back-to-back autosaves in order, one slot each', async () => {
    const { manager } = setup();
    const slots = await Promise.all([1, 2, 3].map((turns) => manager.autosave(stateAfter(turns))));
    assert.deepEqual(slots.map((s) => s.slot), ['auto-1', 'auto-2', 'auto-3']);
    assert.equal((await manager.loadLatest())?.meta.turn, 3);
  });

  it('keeps the slot pointer across a new manager (a reload) and in the same write as the save', async () => {
    const storage = createMemoryStorage();
    await setup({ storage }).manager.autosave(stateAfter(1)); // auto-1, pointer -> 1
    assert.equal(await storage.get('settings', 'autoPointer'), 1);
    assert.equal((await setup({ storage }).manager.autosave(stateAfter(2))).slot, 'auto-2');
  });

  it('leaves nothing half-written when the pointer part of an autosave fails', async () => {
    const { storage, manager } = setup();
    storage.onOperation = (op, store) => {
      if (op === 'put' && store === 'settings') throw new Error('settings write failed');
    };
    await assert.rejects(manager.autosave(stateAfter(1)), code('write_failed'));
    storage.onOperation = () => {};
    assert.deepEqual(await manager.list(), [], 'the save was not written without its pointer');
    assert.equal((await manager.autosave(stateAfter(1))).slot, 'auto-1');
  });

  it('does not move on to the next autosave slot when a write fails', async () => {
    const { storage, manager } = setup();
    await manager.autosave(stateAfter(0)); // auto-1
    storage.onOperation = (op, store) => {
      if (op === 'put' && store === 'saves') throw new Error('disk full');
    };
    await assert.rejects(manager.autosave(stateAfter(1)), code('write_failed'));
    storage.onOperation = () => {};
    assert.equal((await manager.autosave(stateAfter(1))).slot, 'auto-2', 'the failed attempt did not use up a slot');
  });

  it('loadLatest() skips a damaged newest save and reports it', async () => {
    const { storage, manager } = setup();
    await manager.autosave(stateAfter(1)); // auto-1
    await manager.autosave(stateAfter(2)); // auto-2, newest
    const record = await storage.get('saves', 'auto-2');
    record.state = { broken: true };
    await storage.put('saves', 'auto-2', record);

    const latest = await manager.loadLatest();
    assert.equal(latest?.slot, 'auto-1');
    assert.deepEqual(latest?.skipped, ['auto-2']);
  });

  it('loadLatest() returns null with no saves and throws when every save is damaged', async () => {
    const { storage, manager } = setup();
    assert.equal(await manager.loadLatest(), null);
    await manager.save('manual-1', stateAfter(1));
    const record = await storage.get('saves', 'manual-1');
    delete record.state.clock;
    await storage.put('saves', 'manual-1', record);
    await assert.rejects(manager.loadLatest(), code('read_failed'));
  });

  it('removes and clears saves', async () => {
    const { manager } = setup();
    await manager.save('manual-1', stateAfter(1));
    await manager.save('manual-2', stateAfter(2));
    await manager.remove('manual-1');
    assert.deepEqual((await manager.list()).map((s) => s.slot), ['manual-2']);
    await assert.rejects(manager.load('manual-1'), code('not_found'));
    await manager.clearAll();
    assert.deepEqual(await manager.list(), []);
  });

  it('flags saves made with different game data', async () => {
    const storage = createMemoryStorage();
    await setup({ storage, dataVersion: 'old-data' }).manager.save('manual-1', stateAfter(1));
    const loaded = await setup({ storage, dataVersion: 'new-data' }).manager.load('manual-1');
    assert.equal(loaded.dataMismatch, true);
  });

  it('turns storage failures into SaveError', async () => {
    const { storage, manager } = setup();
    storage.onOperation = () => {
      throw new Error('storage is gone');
    };
    await assert.rejects(manager.save('manual-1', stateAfter(0)), code('write_failed'));
    await assert.rejects(manager.list(), code('read_failed'));
  });
});

describe('export and import', () => {
  it('round-trips a save through a compressed file into another browser profile', async () => {
    const source = setup();
    const state = stateAfter(3);
    await source.manager.save('manual-1', state);
    const file = await source.manager.exportSlot('manual-1');
    assert.equal(file.gz, true);
    assert.equal(file.mime, 'application/gzip');
    assert.equal(file.filename, 'grand-strategy_turn-3_2026-04.gsave');

    const target = setup();
    const imported = await target.manager.importBytes(file.bytes, 'manual-2');
    assert.equal(imported.summary.slot, 'manual-2');
    assert.equal(imported.dataMismatch, false);
    assert.deepEqual((await target.manager.load('manual-2')).state, state);
  });

  it('also reads uncompressed files', async () => {
    const { manager } = setup();
    await manager.save('manual-1', stateAfter(2));
    const file = await manager.exportSlot('manual-1', { compress: false });
    assert.equal(file.gz, false);
    assert.equal(JSON.parse(bytesToText(file.bytes)).format, 'grand-strategy-save');
    await manager.importBytes(file.bytes, 'manual-3');
    assert.equal((await manager.load('manual-3')).meta.turn, 2);
  });

  it('rejects files that are not saves from this game', async () => {
    const { manager } = setup();
    await assert.rejects(manager.importBytes(textToBytes('hello'), 'manual-1'), code('bad_file'));
    await assert.rejects(manager.importBytes(textToBytes('{"format":"something-else"}'), 'manual-1'), code('bad_file'));
    await assert.rejects(manager.importBytes(new Uint8Array([0x1f, 0x8b, 0, 0, 0]), 'manual-1'), code('bad_file'));
  });

  it('rejects a damaged save inside a valid file', async () => {
    const { manager } = setup();
    await manager.save('manual-1', stateAfter(1));
    const doc = JSON.parse(bytesToText((await manager.exportSlot('manual-1', { compress: false })).bytes));
    delete doc.record.state.rng;
    await assert.rejects(manager.importBytes(textToBytes(JSON.stringify(doc)), 'manual-2'), code('bad_file'));
  });

  it('refuses a save from a newer version of the game', async () => {
    const { manager } = setup();
    await manager.save('manual-1', stateAfter(1));
    const doc = JSON.parse(bytesToText((await manager.exportSlot('manual-1', { compress: false })).bytes));
    doc.record.saveVersion = 99;
    await assert.rejects(manager.importBytes(textToBytes(JSON.stringify(doc)), 'manual-2'), code('too_new'));
  });

  it('knows its autosave slot names', () => {
    assert.deepEqual(AUTO_SLOTS, ['auto-1', 'auto-2', 'auto-3']);
  });
});
