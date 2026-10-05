// Small, dependency-free hashes. Not cryptographic: used for data versions and seeds.

/**
 * 32-bit FNV-1a of a string, as an unsigned integer.
 * @param {string} text
 * @param {number} [basis]
 */
export function fnv1a32(text, basis = 0x811c9dc5) {
  let h = basis | 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Signed 32-bit hash, handy as an RNG seed.
 * @param {string} text
 */
export function hash32(text) {
  return fnv1a32(text) | 0;
}

/**
 * 16-hex-digit digest made from two differently seeded FNV passes.
 * @param {string} text
 */
export function hashText(text) {
  const a = fnv1a32(text);
  const b = fnv1a32(text, 0x9e3779b9);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Digest of any JSON-serializable value.
 * @param {unknown} value
 */
export function hashJson(value) {
  return hashText(JSON.stringify(value));
}
