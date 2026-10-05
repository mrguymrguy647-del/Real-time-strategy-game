// Text lookup for the whole UI (G-30). Every visible string lives in data/i18n/en.json.
// Keys are flat and dotted ("title.newGame"); placeholders are {name}; plurals use
// "<key>.one" and "<key>.other" and are read with tn().

/** @type {Record<string, string>} */
let strings = {};
/** @type {(key: string) => void} */
let onMissing = () => {};
/** @type {Set<string>} */
const reported = new Set();

/**
 * Replace the active string table (called once at boot, and by tests).
 * @param {Record<string, string>} next
 */
export function setStrings(next) {
  strings = next;
  reported.clear();
}

/**
 * Called once per missing key. The app logs a warning; tests make it throw.
 * @param {(key: string) => void} fn
 */
export function setMissingHandler(fn) {
  onMissing = fn;
}

/** @param {string} key */
export function hasKey(key) {
  return Object.hasOwn(strings, key);
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} [params]
 */
function format(text, params) {
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}

/**
 * Look up a string. A missing key shows as ⟦key⟧ so it is impossible to overlook.
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 */
export function t(key, params) {
  if (!Object.hasOwn(strings, key)) {
    if (!reported.has(key)) {
      reported.add(key);
      onMissing(key);
    }
    return `⟦${key}⟧`;
  }
  return format(strings[key], params);
}

/**
 * Plural lookup: uses "<key>.one" when n is 1, otherwise "<key>.other". {n} is always available.
 * @param {string} key
 * @param {number} n
 * @param {Record<string, unknown>} [params]
 */
export function tn(key, n, params) {
  return t(n === 1 ? `${key}.one` : `${key}.other`, { n, ...params });
}
