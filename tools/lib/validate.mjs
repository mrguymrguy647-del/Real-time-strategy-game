// Data validation (DATA_SCHEMAS §9). validateDataset() is a pure function over already-parsed
// files, so tests can feed it deliberately broken data. CI runs it through tools/validate-data.mjs.

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { ACTIONS, isAction } from '../../src/core/actions.js';
import { DATA_FILES } from '../../src/core/data.js';
import { STATS, isStat } from '../../src/core/stats.js';
import { startPrice } from '../../src/formulas/market.js';

const SCHEMA_NAMES = ['balance', 'resources', 'chokepoints', 'governments', 'countries', 'regions', 'scenarios', 'i18n'];

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
 * What the state earns at the start from the resources its country sells abroad, as a share of GDP a
 * year (the same arithmetic as the game: the surplus at the starting prices times the state's share).
 * @param {any} country @param {any[]} resources enabled resources @param {any} market balance.json → market
 */
function startResourceIncome(country, resources, market) {
  const flows = country.start.resources;
  if (!flows) return 0;
  let monthly = 0;
  for (const resource of resources) {
    const surplus = Math.max(0, (flows.production[resource.id] ?? 0) - (flows.consumption[resource.id] ?? 0));
    const share = flows.stateShare?.[resource.id] ?? resource.defaultStateShare;
    monthly += surplus * startPrice(resource, market.startTension, market) * share;
  }
  return (monthly * 12) / (country.start.economy.gdpBn * 1000);
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

  if (schemaOk.has('countries') && schemaOk.has('regions')) {
    const countries = files.countries.items;
    const regions = files.regions.items;
    checkUniqueIds(countries, pathOf.countries);
    checkUniqueIds(regions, pathOf.regions);
    /** @type {Map<string, any>} */
    const countryById = new Map(countries.map((/** @type {any} */ c) => [c.id, c]));
    /** @type {Map<string, any>} */
    const regionById = new Map(regions.map((/** @type {any} */ r) => [r.id, r]));
    const governmentIds = schemaOk.has('governments') ? new Set(files.governments.items.map((/** @type {any} */ g) => g.id)) : null;
    const resourceIds = schemaOk.has('resources') ? new Set(files.resources.items.map((/** @type {any} */ r) => r.id)) : null;
    /** The resources the game plays with (water is a disabled module). */
    const enabledResources = schemaOk.has('resources') ? files.resources.items.filter((/** @type {any} */ r) => r.enabled) : [];
    const chokepointIds = schemaOk.has('chokepoints') ? new Set(files.chokepoints.items.map((/** @type {any} */ c) => c.id)) : null;

    for (const region of regions) {
      const label = `${pathOf.regions} (${region.id})`;
      if (!region.id.startsWith(`${region.country}-`)) fail(label, `the id must start with its country "${region.country}-"`);
      const owner = countryById.get(region.country);
      if (!owner) fail(label, `unknown country "${region.country}"`);
      else if (owner.theater !== region.theater) fail(label, `theater "${region.theater}" differs from its country's "${owner.theater}"`);
      for (const n of region.neighbors) {
        const other = regionById.get(n);
        if (n === region.id) fail(label, 'a region cannot be its own neighbor');
        else if (!other) fail(label, `neighbor "${n}" does not exist`);
        else if (!other.neighbors.includes(region.id)) fail(label, `neighbors must be symmetric: "${n}" does not list "${region.id}"`);
      }
      for (const n of region.seaLinks ?? []) if (!regionById.has(n)) fail(label, `seaLink "${n}" does not exist`);
      if (region.contested && !region.note) fail(label, 'a contested region needs a neutral "note" (G-22)');
      if (resourceIds) for (const resource of Object.keys(region.output ?? {})) if (!resourceIds.has(resource)) fail(label, `output names unknown resource "${resource}"`);
    }

    for (const country of countries) {
      const label = `${pathOf.countries} (${country.id})`;
      if (governmentIds && !governmentIds.has(country.government)) fail(label, `unknown government "${country.government}"`);
      const own = regions.filter((/** @type {any} */ r) => r.country === country.id);
      if (own.length === 0) fail(label, 'has no regions');
      const capital = regionById.get(country.capital.region);
      if (!capital) fail(label, `capital region "${country.capital.region}" does not exist`);
      else {
        if (capital.country !== country.id) fail(label, `capital region "${capital.id}" belongs to another country`);
        if (!capital.cities.some((/** @type {any} */ c) => c.tier === 'capital' && c.name === country.capital.name)) fail(label, `region "${capital.id}" has no "${country.capital.name}" with tier "capital"`);
      }
      const capitals = own.flatMap((/** @type {any} */ r) => r.cities.filter((/** @type {any} */ c) => c.tier === 'capital'));
      if (capitals.length !== 1) fail(label, `needs exactly one city with tier "capital" (found ${capitals.length})`);

      // The economy skeleton (G-35): sane starting taxes, and a starting budget that roughly balances,
      // so a slipped decimal point cannot start a country bankrupt or with a mountain of cash.
      if (schemaOk.has('balance')) {
        const params = files.balance.values.economy;
        const { economy, budget } = country.start;
        if (economy.taxRate < params.taxMin || economy.taxRate > params.taxMax) fail(label, `start.economy.taxRate ${economy.taxRate} is outside ${params.taxMin}..${params.taxMax}`);
        const spent = Object.values(budget).reduce((a, /** @type {any} */ share) => a + share, 0);
        const rate = Math.min(params.interest.max, params.interest.base + params.interest.riskSlope * Math.max(0, economy.debtPctGdp - params.interest.riskStart));
        const resourceIncome = schemaOk.has('resources') ? startResourceIncome(country, enabledResources, files.balance.values.market) : 0;
        const balance = economy.taxRate + resourceIncome - spent - economy.debtPctGdp * rate;
        if (balance < -0.08 || balance > 0.1) fail(label, `the starting budget balance is ${(balance * 100).toFixed(1)}% of GDP, outside -8%..+10%`);
      }

      // Shares: set on every region of the country or on none, and summing to 1.
      for (const field of ['popShare', 'gdpShare']) {
        const given = own.filter((/** @type {any} */ r) => field in r);
        if (given.length === 0) continue;
        const sum = given.reduce((a, /** @type {any} */ r) => a + r[field], 0);
        if (given.length !== own.length) fail(label, `${field} must be set on every region or on none`);
        else if (Math.abs(sum - 1) > 1e-6) fail(label, `${field} must sum to 1 across its regions (got ${sum})`);
      }
      // Resources: the country's flows and stock (start.resources) and the regions' shares of its production.
      const flows = country.start.resources;
      if (flows && resourceIds) {
        for (const kind of /** @type {const} */ (['production', 'consumption', 'stockpile'])) {
          for (const { id } of enabledResources) if (!(id in flows[kind])) fail(label, `start.resources.${kind} is missing "${id}"`);
          for (const id of Object.keys(flows[kind])) if (!resourceIds.has(id)) fail(label, `start.resources.${kind} names unknown resource "${id}"`);
        }
        for (const id of Object.keys(flows.stateShare ?? {})) if (!resourceIds.has(id)) fail(label, `start.resources.stateShare names unknown resource "${id}"`);
        for (const resource of enabledResources) {
          const made = flows.production[resource.id] ?? 0;
          const used = flows.consumption[resource.id] ?? 0;
          const room = resource.storageMonths * Math.max(made, used);
          if ((flows.stockpile[resource.id] ?? 0) > room + 1e-9) fail(label, `the starting stock of "${resource.id}" (${flows.stockpile[resource.id]}) is more than its storage holds (${room})`);
        }
      }
      if (chokepointIds) for (const id of Object.keys(country.chokepoints ?? {})) if (!chokepointIds.has(id)) fail(label, `unknown chokepoint "${id}"`);
      // Output shares: sum to 1 where the country produces the resource, and are all 0 where it does not.
      const produced = new Set(own.flatMap((/** @type {any} */ r) => Object.keys(r.output ?? {})));
      for (const resource of new Set([...produced, ...(flows ? enabledResources.map((/** @type {any} */ r) => r.id) : [])])) {
        const sum = own.reduce((a, /** @type {any} */ r) => a + (r.output?.[resource] ?? 0), 0);
        const expected = flows ? ((flows.production[resource] ?? 0) > 0 ? 1 : 0) : 1;
        if (Math.abs(sum - expected) > 1e-6) fail(label, `output of "${resource}" must sum to ${expected} across its regions (got ${sum})${flows ? ` because its production is ${flows.production[resource] ?? 0}` : ''}`);
      }
    }
  }

  // The world starts in balance for each resource: what the countries and the rest of the world make is
  // about what they use (a slipped decimal point in one country would start the market in a crisis).
  if (schemaOk.has('countries') && schemaOk.has('resources')) {
    for (const resource of files.resources.items.filter((/** @type {any} */ r) => r.enabled)) {
      let supply = resource.restOfWorld.production;
      let demand = resource.restOfWorld.consumption;
      for (const country of files.countries.items) {
        supply += country.start.resources?.production[resource.id] ?? 0;
        demand += country.start.resources?.consumption[resource.id] ?? 0;
      }
      if (Math.abs(supply - demand) > 0.02 * demand) fail(`${pathOf.resources} (${resource.id})`, `the world starts out of balance: it makes ${supply.toFixed(1)} and uses ${demand.toFixed(1)} a month (more than 2% apart)`);
    }
  }

  if (schemaOk.has('chokepoints')) {
    const where = pathOf.chokepoints;
    checkUniqueIds(files.chokepoints.items, where);
    const regionIds = schemaOk.has('regions') ? new Set(files.regions.items.map((/** @type {any} */ r) => r.id)) : null;
    const resourceIds = schemaOk.has('resources') ? new Set(files.resources.items.map((/** @type {any} */ r) => r.id)) : null;
    for (const chokepoint of files.chokepoints.items) {
      const label = `${where} (${chokepoint.id})`;
      if (regionIds) for (const id of chokepoint.controlRegions) if (!regionIds.has(id)) fail(label, `control region "${id}" does not exist`);
      if (resourceIds) for (const id of Object.keys(chokepoint.worldTradeShare)) if (!resourceIds.has(id)) fail(label, `worldTradeShare names unknown resource "${id}"`);
    }
  }

  if (schemaOk.has('scenarios')) {
    checkUniqueIds(files.scenarios.items, pathOf.scenarios);
    if (schemaOk.has('countries')) {
      const theaters = new Set(files.countries.items.map((/** @type {any} */ c) => c.theater));
      for (const scenario of files.scenarios.items) {
        const label = `${pathOf.scenarios} (${scenario.id})`;
        for (const theater of scenario.theaters) if (!theaters.has(theater)) fail(label, `unknown theater "${theater}"`);
        const inside = new Set(files.countries.items.filter((/** @type {any} */ c) => scenario.theaters.includes(c.theater)).map((/** @type {any} */ c) => c.id));
        for (const id of scenario.playable ?? []) if (!inside.has(id)) fail(label, `playable country "${id}" is not in the scenario's theaters`);
      }
    }
  }

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
