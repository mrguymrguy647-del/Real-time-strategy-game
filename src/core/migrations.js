// Save migrations. When the shape of a saved game changes: bump SAVE_VERSION in version.js and
// add a step here keyed by the version it upgrades FROM. A step receives a save record at
// version N and must return it at version N + 1 (setting both record.saveVersion and
// record.state.meta.saveVersion).

import { SaveError } from './errors.js';
import { SAVE_VERSION } from './version.js';

/** @type {Record<number, (record: any) => any>} */
export const MIGRATIONS = {};

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
      throw new SaveError('migration_failed', `migration from version ${version} failed: ${err instanceof Error ? err.message : err}`, err);
    }
    if (current?.saveVersion !== version + 1) {
      throw new SaveError('migration_failed', `migration from version ${version} did not produce version ${version + 1}`);
    }
    version = current.saveVersion;
  }
  return current;
}
