// Save migrations. When the shape of a saved game changes: bump SAVE_VERSION in version.js and
// add a step here keyed by the version it upgrades FROM. A step receives a save record at
// version N and must return it at version N + 1 (setting both record.saveVersion and
// record.state.meta.saveVersion).

import { SaveError } from './errors.js';
import { SAVE_VERSION } from './version.js';

/** @type {Record<number, (record: any) => any>} */
export const MIGRATIONS = {
  // Version 1 was the Phase 0b test game: a calendar and dice rolls in a world with no countries.
  // There is nothing in it to carry over into a game with a player's country, so it is refused with
  // a clear reason rather than half-converted.
  1: () => {
    throw new SaveError('too_old', 'saves of the early test game (version 1) have no country and cannot be continued');
  },
  // Version 2 was the first economy preview: countries and a budget, but no resources and no market.
  // Their stocks and the world's prices would have to be invented, so it is refused the same way.
  2: () => {
    throw new SaveError('too_old', 'saves of the first economy preview (version 2) have no resources or market and cannot be continued');
  },
};

/**
 * Bring a save record up to the current version, or explain why it cannot be loaded.
 * @param {any} record
 * @param {{ migrations?: Record<number, (record: any) => any>, target?: number }} [options]
 */
export function migrateRecord(record, { migrations = MIGRATIONS, target = SAVE_VERSION } = {}) {
  if (!record || typeof record !== 'object') throw new SaveError('bad_file', 'the save record is not an object');
  let version = record.saveVersion;
  if (!Number.isInteger(version) || version < 1) throw new SaveError('bad_file', `bad save version: ${version}`);
  if (version > target) {
    throw new SaveError('too_new', `save version ${version} is newer than this game understands (${target})`);
  }

  let current = record;
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new SaveError('migration_missing', `no migration from save version ${version}`);
    try {
      current = step(structuredClone(current));
    } catch (err) {
      if (err instanceof SaveError) throw err; // a step may refuse with its own reason
      throw new SaveError('migration_failed', `migration from version ${version} failed: ${err instanceof Error ? err.message : err}`, err);
    }
    if (current?.saveVersion !== version + 1) {
      throw new SaveError('migration_failed', `migration from version ${version} did not produce version ${version + 1}`);
    }
    version = current.saveVersion;
  }
  return current;
}
