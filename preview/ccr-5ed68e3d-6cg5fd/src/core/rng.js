// Seeded random numbers (T-07). The generator is sfc32; its four 32-bit words live in
// state.rng, so a saved game continues exactly where it stopped. Simulation code must use
// this and never Math.random().

import { hash32 } from '../util/hash.js';

/** @typedef {{ s: number[] }} RngState */

/** @param {number} seed */
function splitmix32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) | 0;
  };
}

/**
 * Accepts an integer or a string and returns a signed 32-bit seed.
 * @param {number | string} seed
 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isInteger(seed)) return seed | 0;
  if (typeof seed === 'string') return hash32(seed);
  throw new TypeError('seed must be an integer or a string');
}

/**
 * A fresh generator state for a seed.
 * @param {number | string} seed
 * @returns {RngState}
 */
export function seedRngState(seed) {
  const next = splitmix32(normalizeSeed(seed));
  /** @type {RngState} */
  const state = { s: [next(), next(), next(), next()] };
  const rng = createRng(state);
  for (let i = 0; i < 15; i++) rng.next(); // warm up
  return state;
}

/**
 * Wrap a state object. The state is mutated in place as numbers are drawn.
 * @param {RngState} state
 */
export function createRng(state) {
  /** Uniform float in [0, 1). */
  function next() {
    const s = state.s;
    let a = s[0];
    let b = s[1];
    let c = s[2];
    let d = s[3];
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    s[0] = a;
    s[1] = b;
    s[2] = c;
    s[3] = d;
    return (t >>> 0) / 4294967296;
  }

  return {
    state,
    next,
    /** Uniform float in [min, max). */
    float(min = 0, max = 1) {
      return min + next() * (max - min);
    },
    /** Uniform integer in [min, max], both ends included. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** A random element. @template T @param {T[]} list @returns {T} */
    pick(list) {
      if (list.length === 0) throw new RangeError('cannot pick from an empty list');
      return list[Math.floor(next() * list.length)];
    },
    /** In-place Fisher-Yates shuffle. @template T @param {T[]} list @returns {T[]} */
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
    /** An independent generator that continues from the same point (for what-if previews). */
    clone() {
      return createRng({ s: [...state.s] });
    },
  };
}
