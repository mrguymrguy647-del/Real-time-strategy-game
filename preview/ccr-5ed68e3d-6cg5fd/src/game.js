// The composition root: wires data, state, RNG, the turn pipeline and the systems into one
// headless game object. The UI, the simulator and the tests all use this same object, so what
// is tested is what ships. Nothing here touches the DOM.

import { createBus } from './core/bus.js';
import { createRng } from './core/rng.js';
import { checkStateShape, createInitialState } from './core/state.js';
import { createTurnRunner } from './core/turn.js';
import { demoRollSystem } from './systems/demoRoll.js';

/** Systems registered in the real game, in no particular order (they declare their own). */
export const SYSTEMS = [demoRollSystem];

/**
 * Start a new game, or continue one from a loaded state.
 * @param {{ data: import('./core/data.js').GameData, seed?: number | string, scenarioId?: string,
 *   state?: any, systems?: import('./core/turn.js').System[], checkInvariants?: boolean }} options
 */
export function createGame({ data, seed = 1, scenarioId = 'scaffold_test', state, systems = SYSTEMS, checkInvariants = false }) {
  if (state) {
    const problems = checkStateShape(state);
    if (problems.length > 0) throw new Error(`Cannot continue from this state: ${problems.join(', ')}`);
  }
  const initial = state ?? createInitialState({ data, scenarioId, seed });
  const bus = createBus();
  const runner = createTurnRunner({ systems, checkInvariants });

  const game = {
    data,
    bus,
    systems: runner.systems,
    state: initial,
    rng: createRng(initial.rng),

    /** Advance one turn. Returns { ok: true } or { ok: false, error } after rolling back. */
    endTurn() {
      return runner.endTurn(game);
    },

    /** Put a snapshot back in place (keeps the same state object) and rebuild the RNG on it. @param {any} snapshot */
    restore(snapshot) {
      const current = game.state;
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, snapshot);
      game.rng = createRng(current.rng);
      bus.emit('state:restored');
    },
  };
  return game;
}

/** @typedef {ReturnType<typeof createGame>} Game */
