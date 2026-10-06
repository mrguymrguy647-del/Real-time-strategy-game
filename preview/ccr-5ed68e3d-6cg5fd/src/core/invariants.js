// Checks that game state is plain JSON (T-04): finite numbers (and no -0, which JSON turns into 0), no undefined, no functions,
// no Map/Set/class instances, no shared or circular references. Used by tests, the simulator
// and dev builds; the shipped game does not pay for it on every turn.

/**
 * @param {unknown} root
 * @param {{ limit?: number }} [options]
 * @returns {string[]} human-readable problems, empty when the value is clean
 */
export function findProblems(root, { limit = 20 } = {}) {
  /** @type {string[]} */
  const problems = [];
  const seen = new Set();
  /** @type {Array<[unknown, string]>} */
  const stack = [[root, '$']];

  while (stack.length > 0 && problems.length < limit) {
    const [value, path] = /** @type {[unknown, string]} */ (stack.pop());
    switch (typeof value) {
      case 'number':
        if (!Number.isFinite(value)) problems.push(`${path}: non-finite number (${value})`);
        else if (Object.is(value, -0)) problems.push(`${path}: negative zero (a save file would turn it into 0)`);
        break;
      case 'string':
      case 'boolean':
        break;
      case 'undefined':
        problems.push(`${path}: undefined`);
        break;
      case 'object': {
        if (value === null) break;
        if (seen.has(value)) {
          problems.push(`${path}: circular or shared reference`);
          break;
        }
        seen.add(value);
        if (Array.isArray(value)) {
          value.forEach((item, i) => stack.push([item, `${path}[${i}]`]));
          break;
        }
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
          problems.push(`${path}: non-plain object (${proto?.constructor?.name ?? 'unknown'})`);
          break;
        }
        for (const [key, item] of Object.entries(value)) stack.push([item, `${path}.${key}`]);
        break;
      }
      default:
        problems.push(`${path}: ${typeof value} is not allowed in state`);
    }
  }
  return problems;
}

/**
 * Throw if the state breaks an invariant.
 * @param {unknown} state
 * @param {string} where which step just ran, for the error message
 */
export function assertClean(state, where) {
  const problems = findProblems(state, { limit: 5 });
  if (problems.length > 0) {
    throw new Error(`State invariant failed after ${where}: ${problems.join('; ')}`);
  }
}
