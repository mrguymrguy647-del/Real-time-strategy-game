// Data validation (DATA_SCHEMAS §9). validateDataset() is a pure function over already-parsed
// files, so tests can feed it deliberately broken data. CI runs it through tools/validate-data.mjs.

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { ACTIONS, isAction } from '../../src/core/actions.js';
import { DATA_FILES } from '../../src/core/data.js';
import { STATS, isStat } from '../../src/core/stats.js';

const SCHEMA_NAMES = ['balance', 'resources', 'governments', 'scenarios', 'i18n'];

/**
 * Read every data file and schema from a repository root.
 * @param {string} root
 */
export function readDatasetFromDisk(root) {
  /** @type {Record<string, any>} */
  const files = {};
  /** @type {Record<string, string>} */
  const rawTexts = {};
  for (const file of DATA_FILES) {
    const text = fs.readFileSync(path.join(root, file.path), 'utf8');
    rawTexts[file.key] = text;
    files[file.key] = JSON.parse(text);
  }
  const schemaDir = path.join(root, 'data/schema');
  /** @type {Record<string, any>} */
  const schemas = {};
  for (const name of ['common', ...SCHEMA_NAMES]) {
    schemas[name] = JSON.parse(fs.readFileSync(path.join(schemaDir, `${name}.schema.json`), 'utf8'));
  }
  return { files, schemas, rawTexts };
}

/**
 * JSON.parse silently keeps the last of two equal keys, which is an easy slip when editing text.
 * This scans the raw text and reports duplicates with their line numbers.
 * @param {string} text
 * @returns {string[]}
 */
export function findDuplicateKeys(text) {
  /** @type {string[]} */
  const found = [];
  /** @type {Array<{ kind: 'object' | 'array', keys: Set<string> }>} */
  const stack = [];
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') line++;
    if (c === '"') {
      let j = i + 1;
      let value = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') {
          value += text[j] + text[j + 1];
          j += 2;
        } else {
          value += text[j];
          j++;
        }
      }
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      const top = stack[stack.length - 1];
      if (text[k] === ':' && top?.kind === 'object') {
        if (top.keys.has(value)) found.push(`duplicate key "${value}" at line ${line}`);
        top.keys.add(value);
      }
      i = j + 1;
      continue;
    }
    if (c === '{') stack.push({ kind: 'object', keys: new Set() });
    else if (c === '[') stack.push({ kind: 'array', keys: new Set() });
    else if (c === '}' || c === ']') stack.pop();
    i++;
  }
  return found;
}

/**
 * @param {{ files: Record<string, any>, schemas: Record<string, any>, rawTexts?: Record<string, string> }} dataset
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateDataset({ files, schemas, rawTexts = {} }) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {(where: string, message: string) => void} */
  const fail = (where, message) => errors.push(`${where}: ${message}`);
  const pathOf = Object.fromEntries(DATA_FILES.map((f) => [f.key, f.path]));

  // 1. Duplicate keys in the raw text
  for (const [key, text] of Object.entries(rawTexts)) {
    for (const message of findDuplicateKeys(text)) fail(pathOf[key], message);
  }

  // 2. JSON Schema
  const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
  ajv.addSchema(schemas.common);
  /** @type {Set<string>} */
  const schemaOk = new Set();
  for (const file of DATA_FILES) {
    const validate = ajv.compile(schemas[file.schema]);
    if (validate(files[file.key])) {
      schemaOk.add(file.key);
    } else {
      for (const e of validate.errors ?? []) {
        const extra = e.params && Object.keys(e.params).length > 0 ? ` ${JSON.stringify(e.params)}` : '';
        fail(file.path, `${e.instancePath || '/'} ${e.message}${extra}`);
      }
    }
  }

  /**
   * @param {any[]} effects
   * @param {string} where
   */
  function checkEffects(effects, where) {
    effects.forEach((effect, i) => {
      if ('do' in effect) {
        if (!isAction(effect.do)) {
          fail(where, `effect #${i}: unknown action "${effect.do}"`);
          return;
        }
        for (const arg of ACTIONS[effect.do].args) {
          if (!(arg in effect)) fail(where, `effect #${i}: action "${effect.do}" needs "${arg}"`);
        }
      } else if (!isStat(effect.stat)) {
        fail(where, `effect #${i}: unknown stat "${effect.stat}"`);
      }
    });
  }

  /**
   * @param {any[]} items
   * @param {string} where
   */
  function checkUniqueIds(items, where) {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.id)) fail(where, `duplicate id "${item.id}"`);
      seen.add(item.id);
    }
  }

  // 3. Cross-field and cross-file rules (only for files whose structure is sound)
  if (schemaOk.has('governments')) {
    const where = pathOf.governments;
    const items = files.governments.items;
    checkUniqueIds(items, where);
    const ids = new Set(items.map((/** @type {any} */ g) => g.id));
    for (const gov of items) {
      const label = `${where} (${gov.id})`;
      const sum = Object.values(gov.powerCenters).reduce((a, b) => a + /** @type {number} */ (b), 0);
      if (Math.abs(sum - 1) > 1e-6) fail(label, `powerCenters must sum to 1 (got ${sum})`);
      for (const id of ids) if (!(id in gov.transition.affinity)) fail(label, `transition.affinity is missing "${id}"`);
      for (const key of Object.keys(gov.transition.affinity)) {
        if (!ids.has(key)) fail(label, `transition.affinity names unknown government "${key}"`);
      }
      checkEffects(gov.modifiers, label);
      if (gov.ability) {
        checkEffects(gov.ability.effects, `${label} ability`);
        if (gov.ability.plan) {
          const plan = gov.ability.plan;
          if (!isStat(plan.goal.stat)) fail(label, `plan goal: unknown stat "${plan.goal.stat}"`);
          checkEffects(plan.onSuccess, `${label} plan.onSuccess`);
          checkEffects(plan.onFailure, `${label} plan.onFailure`);
        }
      }
    }
  }

  if (schemaOk.has('resources')) {
    const where = pathOf.resources;
    checkUniqueIds(files.resources.items, where);
    for (const resource of files.resources.items) {
      const label = `${where} (${resource.id})`;
      const steps = resource.shortage;
      for (let i = 1; i < steps.length; i++) {
        if (!(steps[i].coverageBelow < steps[i - 1].coverageBelow)) {
          fail(label, `shortage steps must go from higher to lower coverageBelow (step ${i + 1})`);
        }
      }
      steps.forEach((/** @type {any} */ step, i) => checkEffects(step.effects, `${label} shortage #${i + 1}`));
    }
  }

  if (schemaOk.has('balance')) {
    const where = pathOf.balance;
    const v = files.balance.values;
    const s = v.stability.stages;
    if (!(s.stable > s.troubled && s.troubled > s.crisis && s.crisis > s.failed)) {
      fail(where, 'stability.stages must descend: stable > troubled > crisis > failed');
    }
    if (v.combat.moraleMin > v.combat.moraleMax) fail(where, 'combat.moraleMin must not exceed moraleMax');
    if (!(v.endurance.warnMonths[0] > v.endurance.warnMonths[1])) fail(where, 'endurance.warnMonths must be [earlier, later] with the first larger');
  }

  if (schemaOk.has('scenarios')) checkUniqueIds(files.scenarios.items, pathOf.scenarios);

  if (schemaOk.has('i18n')) {
    const where = pathOf.i18n;
    /** @type {Record<string, string>} */
    const strings = files.i18n.strings;
    for (let m = 1; m <= 12; m++) if (!(`month.${m}` in strings)) fail(where, `missing "month.${m}"`);
    for (const stat of STATS) if (!(`stat.${stat.id}` in strings)) fail(where, `missing a label for stat "${stat.id}" (expected key "stat.${stat.id}")`);
    for (const key of ['app.title', 'app.shortTitle']) if (!(key in strings)) fail(where, `missing "${key}"`);
    for (const [key, text] of Object.entries(strings)) {
      const withoutTokens = text.replace(/\{[A-Za-z0-9_]+\}/g, '');
      if (/[{}]/.test(withoutTokens)) fail(where, `"${key}" has a broken {placeholder}`);
      if (text !== text.trim()) warnings.push(`${where}: "${key}" has leading or trailing spaces`);
      if (key.endsWith('.one') && !(`${key.slice(0, -4)}.other` in strings)) fail(where, `"${key}" has no matching ".other"`);
      if (key.endsWith('.other') && !(`${key.slice(0, -6)}.one` in strings)) fail(where, `"${key}" has no matching ".one"`);
    }
  }

  return { errors, warnings };
}
