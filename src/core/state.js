// The shape of a running game (ARCHITECTURE §6.2). State holds only values that change; static
// definitions stay in /data (T-05). Phase 1 so far has the clock, the player's choice and each
// country's economy and budget; regions, wars and diplomacy join as their milestones arrive.

import { SAVE_VERSION } from './version.js';
import { createClock } from './clock.js';
import { seedRngState } from './rng.js';
import { countriesOf, playableOf } from './scenario.js';

/**
 * @typedef {import('../formulas/economy.js').Budget} Budget
 * @typedef {{ gdpBn: number, taxRate: number, treasuryMn: number, debtMn: number, last: any }} EconomyState
 *   `last` is what the last month did, for the report (null before the first turn)
 * @typedef {{ government: string, economy: EconomyState, budget: Budget }} CountryState
 */

/**
 * A country at the start of a scenario, from its data. Money is in USD millions (G-25).
 * @param {any} country its entry in countries.json
 * @returns {CountryState}
 */
function initialCountry(country) {
  const { economy, budget } = country.start;
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
  for (const id of countriesOf(data, scenario)) countries[id] = initialCountry(data.countries.byId[id]);
  return {
    meta: { saveVersion: SAVE_VERSION, dataVersion: data.version, scenarioId, difficulty, worldMode, seed },
    rng: seedRngState(seed),
    clock: createClock(scenario.startDate),
    player: { countryId: playerId },
    world: { tension: 0, flags: {} },
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
  else if (state.player.countryId !== null && !state.countries?.[state.player.countryId]) problems.push('the player\'s country is not in the game');
  return problems;
}
