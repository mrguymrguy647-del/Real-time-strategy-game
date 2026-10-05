// The shape of a running game (ARCHITECTURE §6.2). State holds only values that change; static
// definitions stay in /data (T-05). Phase 0b has no countries yet, so most collections are empty.

import { SAVE_VERSION } from './version.js';
import { createClock } from './clock.js';
import { seedRngState } from './rng.js';

/**
 * @param {{ data: import('./data.js').GameData, scenarioId: string, seed: number | string,
 *   difficulty?: string, worldMode?: string }} options
 */
export function createInitialState({ data, scenarioId, seed, difficulty = 'normal', worldMode = 'real' }) {
  const scenario = data.scenarios.byId[scenarioId];
  if (!scenario) throw new Error(`Unknown scenario "${scenarioId}"`);
  return {
    meta: { saveVersion: SAVE_VERSION, dataVersion: data.version, scenarioId, difficulty, worldMode, seed },
    rng: seedRngState(seed),
    clock: createClock(scenario.startDate),
    player: { countryId: /** @type {string | null} */ (null) },
    world: { tension: 0, flags: {} },
    countries: {},
    regions: {},
    decisions: /** @type {any[]} */ ([]),
    news: /** @type {any[]} */ ([]),
    chronicle: /** @type {any[]} */ ([]),
    log: /** @type {any[]} */ ([]),
    // Scaffold-only demo values (Phase 0b); removed when Phase 1 brings real systems.
    demo: { rolls: 0, lastRoll: /** @type {number | null} */ (null) },
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
  if (!state.player || typeof state.player !== 'object') problems.push('player is missing');
  return problems;
}
