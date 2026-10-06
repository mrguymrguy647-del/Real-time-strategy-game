// Formulas answer "why?" (ARCHITECTURE §6.8). A formula returns its number together with the parts it
// is made of, from one computation, so the explanation can never drift from the value. A `sum` is
// the total of its parts; a `product` is their product. The UI shows the parts with their labels
// (data/i18n/en.json, "why.<id>") and the tests check that the parts reproduce the value.

/**
 * @typedef {{ id: string, value: number }} Part
 * @typedef {{ value: number, op: 'sum' | 'product', parts: Part[] }} Explained
 */

/** @param {Part[]} parts @returns {Explained} */
export function sumOf(parts) {
  return { value: parts.reduce((total, part) => total + part.value, 0), op: 'sum', parts };
}

/** @param {Part[]} parts @returns {Explained} */
export function productOf(parts) {
  return { value: parts.reduce((total, part) => total * part.value, 1), op: 'product', parts };
}

/**
 * Keep a sum within bounds. When the bound bites, a part named "limit" carries the difference, so
 * the parts still add up to the value.
 * @param {Explained} sum
 * @param {number} min
 * @param {number} max
 * @returns {Explained}
 */
export function limitSum(sum, min, max) {
  const limited = Math.min(max, Math.max(min, sum.value));
  if (limited === sum.value) return sum;
  // The value is the bound itself, not a re-added total, so it is exactly on the bound.
  return { value: limited, op: 'sum', parts: [...sum.parts, { id: 'limit', value: limited - sum.value }] };
}

/**
 * What a modifier list (add, then mul; DATA_SCHEMAS §3.2) does to a value, as one part that can sit
 * in a sum. For a positive value that is (base + add) × mul − base. The multiplier works on the
 * size of the value, so a bonus helps whether the base is positive or negative (a growth bonus of
 * ×1.1 turns −2% into −1.8%, not −2.2%).
 * @param {number} base
 * @param {{ add: number, mul: number }} modifiers
 */
export function modifierPart(base, { add, mul }) {
  return add + Math.abs(base + add) * (mul - 1);
}
