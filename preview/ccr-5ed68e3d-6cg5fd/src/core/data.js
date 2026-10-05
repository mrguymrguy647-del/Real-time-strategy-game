// Loads the JSON content in /data once, checks its envelope, indexes it and freezes it (T-05).
// The reader is injected: fetch in the browser, fs in Node. Strict validation (schemas and
// cross-file rules) runs in CI via tools/validate-data.mjs, not in the shipped game.

import { DataError } from './errors.js';
import { hashJson } from '../util/hash.js';

/**
 * @typedef {{ items: any[], byId: Record<string, any> }} Indexed
 * @typedef {{
 *   version: string,
 *   balance: any,
 *   resources: Indexed,
 *   governments: Indexed,
 *   scenarios: Indexed,
 *   i18n: { lang: string, strings: Record<string, string> },
 * }} GameData
 */

/** Every file the game needs. `shape` is the key that holds the content. */
export const DATA_FILES = [
  { key: 'balance', schema: 'balance', path: 'data/balance.json', shape: 'values' },
  { key: 'resources', schema: 'resources', path: 'data/resources.json', shape: 'items' },
  { key: 'governments', schema: 'governments', path: 'data/governments.json', shape: 'items' },
  { key: 'scenarios', schema: 'scenarios', path: 'data/scenarios.json', shape: 'items' },
  { key: 'i18n', schema: 'i18n', path: 'data/i18n/en.json', shape: 'strings' },
];

/**
 * @param {{ schema: string, path: string, shape: string }} file
 * @param {any} json
 */
function checkEnvelope(file, json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new DataError(`${file.path}: expected a JSON object`);
  }
  if (json.schema !== file.schema) {
    throw new DataError(`${file.path}: expected schema "${file.schema}" but found "${json.schema}"`);
  }
  if (!Number.isInteger(json.version)) throw new DataError(`${file.path}: "version" must be an integer`);
  const body = json[file.shape];
  const ok = file.shape === 'items' ? Array.isArray(body) : body && typeof body === 'object' && !Array.isArray(body);
  if (!ok) throw new DataError(`${file.path}: "${file.shape}" is missing or has the wrong type`);
  return json;
}

/**
 * @param {any[]} items
 * @param {string} name
 * @returns {Indexed}
 */
function indexList(items, name) {
  /** @type {Record<string, any>} */
  const byId = {};
  for (const item of items) {
    if (!item || typeof item.id !== 'string') throw new DataError(`${name}: every entry needs a string "id"`);
    if (Object.hasOwn(byId, item.id)) throw new DataError(`${name}: duplicate id "${item.id}"`);
    byId[item.id] = item;
  }
  return { items, byId };
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Turn the raw, already envelope-checked files into the game's data object.
 * @param {Record<string, any>} raw files by key
 * @returns {GameData}
 */
export function buildData(raw) {
  const content = {
    balance: raw.balance.values,
    resources: raw.resources.items,
    governments: raw.governments.items,
    scenarios: raw.scenarios.items,
  };
  return deepFreeze({
    // UI text is deliberately left out: editing a sentence must not invalidate saves.
    version: hashJson(content).slice(0, 12),
    balance: content.balance,
    resources: indexList(content.resources, 'resources'),
    governments: indexList(content.governments, 'governments'),
    scenarios: indexList(content.scenarios, 'scenarios'),
    i18n: { lang: raw.i18n.lang, strings: raw.i18n.strings },
  });
}

/**
 * @param {(path: string) => Promise<any>} readJson resolves a path like "data/balance.json" to parsed JSON
 * @returns {Promise<GameData>}
 */
export async function loadData(readJson) {
  const entries = await Promise.all(
    DATA_FILES.map(async (file) => {
      /** @type {any} */
      let json;
      try {
        json = await readJson(file.path);
      } catch (err) {
        throw new DataError(`Could not load ${file.path}: ${err instanceof Error ? err.message : err}`, err);
      }
      return /** @type {[string, any]} */ ([file.key, checkEnvelope(file, json)]);
    }),
  );
  return buildData(Object.fromEntries(entries));
}
