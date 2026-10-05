// The turn pipeline (ARCHITECTURE §6.4). Systems register with an order and a cadence; endTurn
// runs the ones that apply, advances the clock, and is crash-safe (T-11): if anything throws,
// the state is rolled back to the start of the turn and the error is reported, never lost.

import { advanceClock, cadenceRuns, peekAdvance } from './clock.js';
import { assertClean } from './invariants.js';

export const NEWS_LIMIT = 200;

/**
 * @typedef {object} TurnContext
 * @property {any} state
 * @property {import('./data.js').GameData} data
 * @property {ReturnType<typeof import('./rng.js').createRng>} rng
 * @property {ReturnType<typeof import('./bus.js').createBus>} bus
 * @property {{ year: number, month: number, week: number, monthCompleted: boolean }} turn
 *   the date this turn leads to, and whether it completes a month
 * @property {(entry: { importance: number, template: string, params?: Record<string, unknown>, refs?: string[] }) => void} news
 *
 * @typedef {object} System
 * @property {string} id
 * @property {number} order
 * @property {import('./clock.js').Cadence} cadence
 * @property {(ctx: TurnContext) => void} step
 */

/**
 * @param {{ systems?: System[], checkInvariants?: boolean }} [options]
 */
export function createTurnRunner({ systems = [], checkInvariants = false } = {}) {
  const ordered = [...systems].sort((a, b) => a.order - b.order);
  const ids = new Set();
  for (const system of ordered) {
    if (ids.has(system.id)) throw new Error(`Duplicate system id "${system.id}"`);
    ids.add(system.id);
  }

  /**
   * @param {any} game
   * @returns {{ ok: true } | { ok: false, error: { code: string, system?: string, message: string, stack?: string } }}
   */
  function endTurn(game) {
    const state = game.state;
    const blocking = state.decisions.filter((/** @type {any} */ d) => d.blocking);
    if (blocking.length > 0) {
      return { ok: false, error: { code: 'decisions_pending', message: `${blocking.length} decision(s) need an answer first` } };
    }

    const snapshot = structuredClone(state);
    const turn = peekAdvance(state.clock);
    const scale = state.clock.scale;
    /** @type {TurnContext} */
    const ctx = {
      state,
      data: game.data,
      rng: game.rng,
      bus: game.bus,
      turn,
      news(entry) {
        state.news.push({ turn: state.clock.turn + 1, year: turn.year, month: turn.month, ...entry });
        if (state.news.length > NEWS_LIMIT) state.news.splice(0, state.news.length - NEWS_LIMIT);
      },
    };

    let current = 'start';
    try {
      for (const system of ordered) {
        if (!cadenceRuns(system.cadence, { monthCompleted: turn.monthCompleted, scale })) continue;
        current = system.id;
        system.step(ctx);
        if (checkInvariants) assertClean(state, system.id);
      }
      current = 'clock';
      advanceClock(state.clock);
      if (checkInvariants) assertClean(state, 'clock');
    } catch (err) {
      game.restore(snapshot);
      const error = {
        code: 'turn_failed',
        system: current,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      };
      game.bus.emit('turn:failed', error);
      return { ok: false, error };
    }

    game.bus.emit('turn:end', { turn: state.clock.turn, monthCompleted: turn.monthCompleted });
    return { ok: true };
  }

  return { endTurn, systems: ordered };
}
