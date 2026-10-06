// The shape of a running game (ARCHITECTURE §6.2). State holds only values that change; static
// definitions stay in /data (T-05). Phase 1 so far has the clock, the player's choice, each
// country's economy, budget and resources, and the world market; regions, wars and diplomacy join as
// their milestones arrive.

import { SAVE_VERSION } from './version.js';
import { startPrice } from '../formulas/market.js';
import { createClock } from './clock.js';
import { seedRngState } from './rng.js';
import { countriesOf, playableOf } from './scenario.js';

/**
 * @typedef {import('../formulas/economy.js').Budget} Budget
 * @typedef {{ gdpBn: number, taxRate: number, treasuryMn: number, debtMn: number, last: any }} EconomyState
 *   `last` is what the last month did, for the report (null before the first turn)
 * @typedef {{ stock: number, step: number, last: any }} ResourceState
 *   `stock` in the units of resources.json; `step` is how deep into its shortage ladder the country is (0 = not short, 1 = the
 *   mildest step); `last` is what the last month did (null before the first turn)
 * @typedef {{ government: string, economy: EconomyState, budget: Budget, resources: Record<string, ResourceState> }} CountryState
 */

/**
 * A country at the start of a scenario, from its data. Money is in USD millions (G-25).
 * @param {any} country its entry in countries.json
 * @param {import('./data.js').GameData} data
 * @returns {CountryState}
 */
function initialCountry(country, data) {
  const { economy, budget, resources } = country.start;
  return {
    government: country.government,
    economy: {
      gdpBn: economy.gdpBn,
      taxRate: economy.taxRate,
      treasuryMn: economy.treasuryMn,
      debtMn: economy.debtPctGdp * economy.gdpBn * 1000,
      last: null,
    },
    budget: { military: budget.military, research: budget.research, welfare: budget.welfare, infrastructure: budget.infrastructure },
    resources: Object.fromEntries(data.activeResources.map((resource) => [resource.id, { stock: resources.stockpile[resource.id], step: 0, last: null }])),
  };
}

/**
 * The world at the start of a scenario: world tension, the price of each resource (the market in
 * balance, in an average mood) and the chokepoints, all open.
 * @param {import('./data.js').GameData} data
 */
function initialWorld(data) {
  const { market } = data.balance;
  return {
    tension: market.startTension,
    flags: {},
    market: Object.fromEntries(data.activeResources.map((resource) => [resource.id, { price: startPrice(resource, market.startTension, market), shock: 1, last: null }])),
    chokepoints: Object.fromEntries(data.chokepoints.items.map((chokepoint) => [chokepoint.id, { blockade: 0 }])),
  };
}

/**
 * @param {{ data: import('./data.js').GameData, scenarioId: string, seed: number | string,
 *   playerId?: string | null, difficulty?: string, worldMode?: string }} options
 */
export function createInitialState({ data, scenarioId, seed, playerId = null, difficulty = 'normal', worldMode = 'real' }) {
  const scenario = data.scenarios.byId[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario "${scenarioId}"`);
  if (playerId !== null && !playableOf(data, scenario).includes(playerId)) {
    throw new Error(`"${playerId}" cannot be played in the scenario "${scenarioId}"`);
  }
  /** @type {Record<string, CountryState>} */
  const countries = {};
  for (const id of countriesOf(data, scenario)) countries[id] = initialCountry(data.countries.byId[id], data);
  return {
    meta: { saveVersion: SAVE_VERSION, dataVersion: data.version, scenarioId, difficulty, worldMode, seed },
    rng: seedRngState(seed),
    clock: createClock(scenario.startDate),
    player: { countryId: playerId },
    world: initialWorld(data),
    countries,
    regions: {},
    decisions: /** @type {any[]} */ ([]),
    news: /** @type {any[]} */ ([]),
    chronicle: /** @type {any[]} */ ([]),
    log: /** @type {any[]} */ ([]),
  };
}

/** @typedef {ReturnType<typeof createInitialState>} GameState */

/**
 * Cheap structural check for a state that came from a save or an import.
 * @param {any} state
 * @returns {string[]} problems, empty when the shape is usable
 */
export function checkStateShape(state) {
  /** @type {string[]} */
  const problems = [];
  if (!state || typeof state !== 'object') return ['state is not an object'];
  if (!state.meta || typeof state.meta !== 'object') problems.push('meta is missing');
  if (!state.rng || !Array.isArray(state.rng.s) || state.rng.s.length !== 4) problems.push('rng is missing or malformed');
  const clock = state.clock;
  if (!clock || !Number.isInteger(clock.year) || !Number.isInteger(clock.month) || !Number.isInteger(clock.turn)) {
    problems.push('clock is missing or malformed');
  }
  for (const key of ['decisions', 'news', 'chronicle', 'log']) {
    if (!Array.isArray(state[key])) problems.push(`${key} must be a list`);
  }
  if (!state.countries || typeof state.countries !== 'object' || Array.isArray(state.countries)) problems.push('countries is missing');
  if (!state.player || typeof state.player !== 'object') problems.push('player is missing');
  else if (state.player.countryId !== null && !(state.countries && Object.hasOwn(state.countries, state.player.countryId))) problems.push('the player\'s country is not in the game');
  if (state.countries && typeof state.countries === 'object') {
    for (const [id, country] of Object.entries(state.countries)) problems.push(...checkCountryShape(id, country));
  }
  problems.push(...checkWorldShape(state.world));
  return problems;
}

/**
 * The world's market and straits must be usable, so a damaged save is refused when it is opened.
 * @param {any} world
 * @returns {string[]}
 */
function checkWorldShape(world) {
  if (!world || typeof world !== 'object') return ['world is missing'];
  /** @type {string[]} */
  const problems = [];
  if (!Number.isFinite(world.tension)) problems.push('the world has a bad tension');
  if (!world.market || typeof world.market !== 'object') problems.push('the world has no market');
  else {
    for (const [id, entry] of Object.entries(world.market)) {
      if (!entry || !(Number.isFinite(entry.price) && entry.price > 0)) problems.push(`the market for ${id} has a bad price`);
      else if (!(Number.isFinite(entry.shock) && entry.shock > 0)) problems.push(`the market for ${id} has a bad mood`);
    }
  }
  if (!world.chokepoints || typeof world.chokepoints !== 'object') problems.push('the world has no chokepoints');
  else {
    for (const [id, entry] of Object.entries(world.chokepoints)) {
      if (!entry || !(Number.isFinite(entry.blockade) && entry.blockade >= 0 && entry.blockade <= 1)) problems.push(`the chokepoint ${id} has a bad blockade`);
    }
  }
  return problems;
}

const BUDGET_KEYS = ['military', 'research', 'welfare', 'infrastructure'];

/**
 * A country in a loaded or imported state must have what the economy and the screens read, so a
 * hand-edited or damaged save is refused when it is opened, not when a screen falls over on it.
 * @param {string} id
 * @param {any} country
 * @returns {string[]}
 */
function checkCountryShape(id, country) {
  const where = `country ${id}`;
  if (!country || typeof country !== 'object') return [`${where} is not an object`];
  /** @type {string[]} */
  const problems = [];
  if (typeof country.government !== 'string') problems.push(`${where} has no government`);
  const economy = country.economy;
  if (!economy || typeof economy !== 'object') {
    problems.push(`${where} has no economy`);
  } else {
    if (!(Number.isFinite(economy.gdpBn) && economy.gdpBn > 0)) problems.push(`${where} has a bad GDP`);
    for (const key of ['taxRate', 'treasuryMn', 'debtMn']) if (!Number.isFinite(economy[key]) || economy[key] < 0) problems.push(`${where} has a bad ${key}`);
  }
  const budget = country.budget;
  if (!budget || typeof budget !== 'object') problems.push(`${where} has no budget`);
  else for (const key of BUDGET_KEYS) if (!Number.isFinite(budget[key]) || budget[key] < 0) problems.push(`${where} has a bad ${key} budget`);
  if (!country.resources || typeof country.resources !== 'object') problems.push(`${where} has no resources`);
  else {
    for (const [resource, entry] of Object.entries(country.resources)) {
      if (!entry || !(Number.isFinite(entry.stock) && entry.stock >= 0)) problems.push(`${where} has a bad stock of ${resource}`);
      else if (!Number.isInteger(entry.step) || entry.step < 0) problems.push(`${where} has a bad shortage step for ${resource}`);
    }
  }
  return problems;
}
