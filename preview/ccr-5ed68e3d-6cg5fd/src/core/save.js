// Saving and loading (ARCHITECTURE §11): 3 rotating autosaves and 5 manual slots, versioned
// records with migrations, and export/import as a file. Every storage call is guarded so the
// UI gets a SaveError it can explain, never a raw exception.

import { APP_ID, EXPORT_FORMAT, EXPORT_FORMAT_VERSION, OLDEST_PLAYABLE_SAVE, SAVE_VERSION } from './version.js';
import { SaveError } from './errors.js';
import { MIGRATIONS, migrateRecord } from './migrations.js';
import { checkStateShape } from './state.js';
import { bytesToText, canCompress, gunzip, gzip, isGzip, textToBytes } from '../util/compress.js';

export const AUTO_SLOTS = ['auto-1', 'auto-2', 'auto-3'];
export const MANUAL_SLOTS = ['manual-1', 'manual-2', 'manual-3', 'manual-4', 'manual-5'];
export const ALL_SLOTS = [...AUTO_SLOTS, ...MANUAL_SLOTS];

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/**
 * @typedef {{ countryId: string | null, year: number, month: number, week: number, turn: number,
 *   scenarioId: string, difficulty: string }} SaveMeta
 * @typedef {{ slot: string, savedAt: number, saveVersion: number, dataVersion: string, meta: SaveMeta }} SlotSummary
 */

/**
 * What the Saves screen shows about a game.
 * @param {any} state
 * @returns {SaveMeta}
 */
export function summarize(state) {
  return {
    countryId: state.player.countryId,
    year: state.clock.year,
    month: state.clock.month,
    week: state.clock.week,
    turn: state.clock.turn,
    scenarioId: state.meta.scenarioId,
    difficulty: state.meta.difficulty,
  };
}

/**
 * @param {{ storage: import('./storage/types.js').Storage, dataVersion: string, now?: () => number,
 *   migrations?: Record<number, (record: any) => any> }} options
 */
export function createSaveManager({ storage, dataVersion, now = () => Date.now(), migrations = MIGRATIONS }) {
  /** @param {string} slot */
  function checkSlot(slot) {
    if (!ALL_SLOTS.includes(slot)) throw new SaveError('bad_slot', `unknown save slot "${slot}"`);
  }

  /**
   * @template T
   * @param {string} code
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async function guarded(code, fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SaveError) throw err;
      throw new SaveError(code, err instanceof Error ? err.message : String(err), err);
    }
  }

  /**
   * Write the full record and its small summary (plus any extra writes) in one all-or-nothing step.
   * @param {string} slot
   * @param {any} record
   * @param {Array<{ store: string, key: string, value: any }>} [extra]
   * @returns {Promise<SlotSummary>}
   */
  async function writeRecord(slot, record, extra = []) {
    /** @type {SlotSummary} */
    const summary = {
      slot,
      savedAt: record.savedAt,
      saveVersion: record.saveVersion,
      dataVersion: record.dataVersion,
      meta: record.meta,
    };
    await guarded('write_failed', () =>
      storage.putMany([
        { store: 'saves', key: slot, value: record },
        { store: 'slots', key: slot, value: summary },
        ...extra,
      ]),
    );
    return summary;
  }

  /** @param {any} state @returns {any} a copy of the state, refusing a broken one */
  function snapshotOf(state) {
    const problems = checkStateShape(state);
    if (problems.length > 0) throw new SaveError('bad_file', `refusing to save a broken game: ${problems.join(', ')}`);
    // Copy now: the write is asynchronous and the game keeps running meanwhile.
    return structuredClone(state);
  }

  /** @param {string} slot @param {any} snapshot */
  function buildRecord(slot, snapshot) {
    return { slot, savedAt: now(), saveVersion: SAVE_VERSION, dataVersion, meta: summarize(snapshot), state: snapshot };
  }

  /**
   * @param {string} slot
   * @param {any} state
   */
  async function save(slot, state) {
    checkSlot(slot);
    return writeRecord(slot, buildRecord(slot, snapshotOf(state)));
  }

  /** Newest first. Cheap: reads only the small summaries. @returns {Promise<SlotSummary[]>} */
  async function list() {
    const summaries = await guarded('read_failed', () => storage.getAll('slots'));
    return summaries.filter((s) => ALL_SLOTS.includes(s.slot)).sort((a, b) => b.savedAt - a.savedAt);
  }

  /** @param {string} slot */
  async function loadRecord(slot) {
    checkSlot(slot);
    const record = await guarded('read_failed', () => storage.get('saves', slot));
    if (!record) throw new SaveError('not_found', `slot ${slot} is empty`);
    const migrated = migrateRecord(record, { migrations });
    const problems = checkStateShape(migrated.state);
    if (problems.length > 0) throw new SaveError('bad_file', `slot ${slot} is damaged: ${problems.join(', ')}`);
    return migrated;
  }

  /** @param {string} slot */
  async function load(slot) {
    const record = await loadRecord(slot);
    return { state: record.state, savedAt: record.savedAt, meta: record.meta, dataMismatch: record.dataVersion !== dataVersion };
  }

  /**
   * Load the newest save that is readable, skipping damaged ones. Saves of the early test game are
   * left out without a word (they cannot be continued, and are not damaged). Null when there are no saves.
   * @returns {Promise<(Awaited<ReturnType<typeof load>> & { slot: string, skipped: string[] }) | null>}
   */
  async function loadLatest() {
    const summaries = await list();
    if (summaries.length === 0) return null;
    const playable = summaries.filter((summary) => summary.saveVersion >= OLDEST_PLAYABLE_SAVE);
    if (playable.length === 0) throw new SaveError('too_old', 'every save is from the early test game, which cannot be continued');
    /** @type {string[]} */
    const skipped = [];
    /** @type {unknown} */
    let lastError = null;
    for (const summary of playable) {
      try {
        return { ...(await load(summary.slot)), slot: summary.slot, skipped };
      } catch (err) {
        skipped.push(summary.slot);
        lastError = err;
      }
    }
    throw new SaveError('read_failed', 'none of the saves could be read', lastError);
  }

  /** The autosave slot to use next (0-2): read from storage once, then kept in memory. @type {number | null} */
  let autoIndex = null;
  /** Autosaves run one at a time, in order, so quick turns can never overlap their writes. */
  let autosaveChain = Promise.resolve();

  /** @param {any} snapshot */
  async function writeAutosave(snapshot) {
    let index = autoIndex;
    if (index === null) {
      const stored = await guarded('read_failed', () => storage.get('settings', 'autoPointer'));
      index = Number.isInteger(stored) && stored >= 0 && stored < AUTO_SLOTS.length ? /** @type {number} */ (stored) : 0;
    }
    const slot = AUTO_SLOTS[index];
    const next = (index + 1) % AUTO_SLOTS.length;
    // The slot pointer moves in the same all-or-nothing write as the save, so a failure or an
    // interrupted page can never leave the pointer and the saves disagreeing.
    const summary = await writeRecord(slot, buildRecord(slot, snapshot), [{ store: 'settings', key: 'autoPointer', value: next }]);
    autoIndex = next;
    return summary;
  }

  /** Write to the next of the three rotating autosave slots. @param {any} state */
  function autosave(state) {
    let snapshot;
    try {
      snapshot = snapshotOf(state);
    } catch (err) {
      return Promise.reject(err);
    }
    const run = autosaveChain.then(() => writeAutosave(snapshot));
    autosaveChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** @param {string} slot */
  async function remove(slot) {
    checkSlot(slot);
    await guarded('write_failed', () =>
      storage.deleteMany([
        { store: 'saves', key: slot },
        { store: 'slots', key: slot },
      ]),
    );
  }

  async function clearAll() {
    await guarded('write_failed', async () => {
      await storage.clear('saves');
      await storage.clear('slots');
      await storage.delete('settings', 'autoPointer');
      autoIndex = null;
    });
  }

  /**
   * Turn a saved game into a file. Compressed with gzip when the browser can.
   * @param {string} slot
   * @param {{ compress?: boolean }} [options]
   */
  async function exportSlot(slot, { compress = true } = {}) {
    checkSlot(slot);
    const record = await guarded('read_failed', () => storage.get('saves', slot));
    if (!record) throw new SaveError('not_found', `slot ${slot} is empty`);
    const doc = { format: EXPORT_FORMAT, formatVersion: EXPORT_FORMAT_VERSION, appId: APP_ID, exportedAt: now(), record };
    let bytes = textToBytes(JSON.stringify(doc));
    let gz = false;
    if (compress && canCompress) {
      bytes = await gzip(bytes);
      gz = true;
    }
    const meta = record.meta;
    const filename = `${APP_ID}_turn-${meta.turn}_${meta.year}-${String(meta.month).padStart(2, '0')}.gsave`;
    return { bytes, gz, filename, mime: gz ? 'application/gzip' : 'application/json' };
  }

  /**
   * Read a save file (plain or gzip) into a slot.
   * @param {Uint8Array} bytes
   * @param {string} slot
   */
  async function importBytes(bytes, slot) {
    checkSlot(slot);
    if (bytes.length > MAX_IMPORT_BYTES) throw new SaveError('bad_file', 'the file is too large to be a save');
    /** @type {any} */
    let doc;
    try {
      doc = JSON.parse(bytesToText(isGzip(bytes) ? await gunzip(bytes) : bytes));
    } catch (err) {
      throw new SaveError('bad_file', 'the file is not a readable save', err);
    }
    if (doc?.format !== EXPORT_FORMAT || doc.formatVersion !== EXPORT_FORMAT_VERSION || !doc.record) {
      throw new SaveError('bad_file', 'the file is not a save from this game');
    }
    const record = migrateRecord(doc.record, { migrations });
    const problems = checkStateShape(record.state);
    if (problems.length > 0) throw new SaveError('bad_file', `the save is damaged: ${problems.join(', ')}`);
    const summary = await writeRecord(slot, { ...record, slot, savedAt: now() });
    return { summary, dataMismatch: record.dataVersion !== dataVersion };
  }

  return { save, autosave, load, loadLatest, list, remove, clearAll, exportSlot, importBytes };
}
